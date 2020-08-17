import * as net from "net";
import * as io from "io";
import * as coroutine from "coroutine";
import * as hash from "hash";


export class MailPop3 {
    private sock:Class_Socket
    private stream:Class_BufferedStream;
    private conEvt:Class_Event;
    private apopTimeStamp:string;
    /**
     *
     * @param server 服務器url  tcp://pop.qq.com:110 ssl://pop.qq.com:995
     */
    constructor(private server:string, private auth?:{user:string, pass:string, normal?:boolean}) {
        // if(!byServer){
        //     this.byServer = 'ssl://pop.'+senderAddress.split('@')[1]+':995';
        // }
    }
    public connect(){
        if(this.sock){
           return;
        }
        if(this.conEvt){
            let evt=this.conEvt;
            evt.wait();
            console.warn("on_con_ready", !this.sock)
            if(!this.sock){
                throw new Error(evt["_err_"]);
            }
            return;
        }
        let evt = this.conEvt = new coroutine.Event(false);
        let sock = <Class_Socket>net.connect(this.server);
        this.stream = new io.BufferedStream(sock);
        this.stream.EOL = "\r\n";
        try{
            let str = this.stream.readLine();
            if(str==null || !str.startsWith(RSP_OK)){
                this.drop(new Error(str+""), sock);
            }else{
                this.apopTimeStamp = str;
                if(this.auth){
                    if(this.auth.normal){
                        this._authNormal(true,this.auth.user, this.auth.pass);
                    }else{
                        this._authDigest(true,this.auth.user, this.auth.pass);
                    }
                }
                this.conEvt = null;
                this.sock = sock;
                evt.set();
            }
        }catch (e) {
            this.drop(e, sock);
        }
    }

    public authNormal(user:string, passWord:string){
        return this._authNormal(false, user, passWord);
    }
    public authApop(user:string, passWord:string){
        return this._authDigest(false, user, passWord)
    }
    public _authNormal(inited:boolean, user:string, passWord:string){
        this._pre(inited, MailPop3Cmd.USER, user);
        let a = this._pre(inited, MailPop3Cmd.PASS, passWord);
        if(!a.startsWith(RSP_OK)){
            this.drop(null);
            throw new Error(a);
        }
        return true;
    }
    private _authDigest(inited:boolean, user:string, passWord:string){
        let a = this._pre(inited, MailPop3Cmd.APOP, user,hash.md5(Buffer.from(this.apopTimeStamp+passWord)).digest("hex"));
        if(!a.startsWith(RSP_OK)){
            return this._authNormal(inited, user, passWord);
        }
        return true;
    }

    public stat(){
        let a = this.sendCommand(MailPop3Cmd.STAT)[0].replace(RSP_OK,"").trim();
        return <number[]><any>a.split(" ").forEach((e,i,r:any)=>{
            r[i] = Number(e);
        });
    }

    public uidl(){
        let a = this.sendCommand(MailPop3Cmd.UIDL);
        a.shift();
        let rets:Array<{i:number,v:string}> = [];
        a.forEach(e=>{
            let r = e.split(" ");
            rets.push({i:Number(r[0]),v:r[1]});
        });
        return rets;
    }
    public list(){
        let a = this.sendCommand(MailPop3Cmd.LIST);
        a.shift();
        let rets:Array<{i:number,v:number}> = [];
        a.forEach(e=>{
            let r = e.split(" ");
            rets.push({i:Number(r[0]),v:Number(r[1])});
        });
        return rets;
    }

    public top(no:number, line?:number){
        let rsp = line>0 ? this.sendCommand(MailPop3Cmd.TOP, no, line):this.sendCommand(MailPop3Cmd.TOP, no);
        rsp.shift();
        return rsp.join(this.stream.EOL);
    }

    public retr(no:number){
        let rsp = this.sendRcv1(MailPop3Cmd.RETR, no);
        if(rsp.startsWith(RSP_OK)){
            if(rsp==RSP_OK){
                return this.readMoreLine().join(this.stream.EOL);
            }
            let n = Number(rsp.split(' ')[1]);
            return this.readSize(n+5).substr(0,n);
        }
        return "";
    }

    public dele(num:number){
        this.sendRcv1(MailPop3Cmd.DELE, num);
        return true;
    }

    public rest(){
        this.sendRcv1(MailPop3Cmd.RSET);
        return true;
    }

    public noop(){
        if(!this.sock){
            return false;
        }
        this.sendRcv1(MailPop3Cmd.NOOP)
        return true;
    }

    public quit(){
        if(this.sock){
            this.stream.writeLine(MailPop3Cmd.QUIT);
            this.stream.flush();
            this.drop(null);
        }
    }
    private writeCmd(inited:boolean, cmd:MailPop3Cmd, ...args){
        if(!inited && !this.sock){
            this.connect();
        }
        this.stream.writeLine([cmd,...args].join(' '));
    }
    private readSize(n:number){
        let r = this.stream.readText(n);
        if(r==null){
            this.drop(null);
            throw new Error("io_error");
        }
        return r;
    }
    private _pre(inited:boolean, cmd:MailPop3Cmd, ...args):string{
        this.writeCmd(inited, cmd, ...args);
        let rsp = this.stream.readLine();
        if(rsp==null){
            this.drop(null);
            throw new Error("io_error");
        }
        return rsp;
    }
    public sendRcv1(cmd:MailPop3Cmd, ...args):string{
        this.writeCmd(false, cmd, ...args);
        let rsp = this.stream.readLine();
        if(rsp==null){
            this.drop(null);
            throw new Error("io_error");
        }
        return rsp;
    }
    public sendCommand(cmd:MailPop3Cmd, ...args):string[]{
        let rsp = this.sendRcv1(cmd, ...args);
        if(rsp.startsWith(RSP_OK)){
            if(cmd==MailPop3Cmd.LIST || cmd==MailPop3Cmd.UIDL || cmd==MailPop3Cmd.TOP || cmd==MailPop3Cmd.RETR){
                return this.readMoreLine([rsp]);
            }
        }
        return [rsp];
    }
    private readMoreLine(arr?:string[]){
        arr = arr?arr:[];
        do{
            let tmp = this.stream.readLine();
            if(tmp==null){
                this.drop(null);
                throw new Error("io_error");
            }
            if(tmp=="."){
                return arr;
            }
            arr.push(tmp);
        }while(true);
        return arr;
    }
    private drop(e:Error, sock?:Class_Socket){
        if(this.sock){
            this.sock.close();
            this.sock = null;
        }
        if(sock){
            sock.close();
        }
        this.stream = null;
        if(this.conEvt){
            let evt = this.conEvt;
            this.conEvt = null;
            evt["_err_"] = e;
            evt.set();
        }
    }
}
const RSP_OK = "+OK";
const RSP_ERR = "-Err";
export enum MailPop3Cmd {
    USER= 'USER',
    PASS= 'PASS',
    APOP= 'APOP',
    STAT= 'STAT',
    UIDL= 'UIDL',
    LIST= 'LIST',
    RETR= 'RETR',
    DELE= 'DELE',
    RSET= 'RSET',
    TOP= 'TOP',
    NOOP= 'NOOP',
    QUIT= 'QUIT'
}