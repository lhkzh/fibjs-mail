import {MailData} from "./MailData";
import * as net from "net";
import * as ssl from "ssl";
ssl.loadRootCerts();

/**
 * 通过smtp发邮件工具类（ 需要fibjs）
 */
export class MailSender {

    /**
     *
     * @param senderAddress 发送人邮箱地址
     * @param senderAuth 发送人-在服务器的授权码
     * @param byServer 发送服务器url
     */
    constructor(private senderAddress:string, private senderAuth:string, private byServer?:string) {
        if (!byServer) {
            this.byServer = 'ssl://smtp.' + senderAddress.split('@')[1] + ':465';
        }
    }
    public send(data:MailData, toMailAddressList?:string[]){
        let toArr:string[] = toMailAddressList||[];
        if(data.recipients){
            data.recipients.forEach(e=>{
                if(!toArr.includes(e.addr)){
                    toArr.push(e.addr);
                }
            })
        }
        let s = net.openSmtp(this.byServer);
        try{
            s.login(this.senderAddress, this.senderAuth);
            s.command('HELO',data.getSenderHost());
            s.command('MAIL FROM:','<'+this.senderAddress+'>');
            toArr.forEach(e=>{
                s.command('RCPT TO:',`<${e}>`);
            });
            s.data(data.encode());
            s.quit();
        }finally {
            s.socket.close();
        }
    }
}