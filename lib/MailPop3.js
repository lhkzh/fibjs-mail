"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const net = require("net");
const io = require("io");
const coroutine = require("coroutine");
const hash = require("hash");
class MailPop3 {
    /**
     *
     * @param server 服務器url  tcp://pop.qq.com:110 ssl://pop.qq.com:995
     */
    constructor(server, auth) {
        this.server = server;
        this.auth = auth;
        // if(!byServer){
        //     this.byServer = 'ssl://pop.'+senderAddress.split('@')[1]+':995';
        // }
    }
    connect() {
        if (this.sock) {
            return;
        }
        if (this.conEvt) {
            let evt = this.conEvt;
            evt.wait();
            console.warn("on_con_ready", !this.sock);
            if (!this.sock) {
                throw new Error(evt["_err_"]);
            }
            return;
        }
        let evt = this.conEvt = new coroutine.Event(false);
        let sock = net.connect(this.server);
        this.stream = new io.BufferedStream(sock);
        this.stream.EOL = "\r\n";
        try {
            let str = this.stream.readLine();
            if (str == null || !str.startsWith(RSP_OK)) {
                this.drop(new Error(str + ""), sock);
            }
            else {
                this.apopTimeStamp = str;
                if (this.auth) {
                    if (this.auth.normal) {
                        this._authNormal(true, this.auth.user, this.auth.pass);
                    }
                    else {
                        this._authDigest(true, this.auth.user, this.auth.pass);
                    }
                }
                this.conEvt = null;
                this.sock = sock;
                evt.set();
            }
        }
        catch (e) {
            this.drop(e, sock);
        }
    }
    authNormal(user, passWord) {
        return this._authNormal(false, user, passWord);
    }
    authApop(user, passWord) {
        return this._authDigest(false, user, passWord);
    }
    _authNormal(inited, user, passWord) {
        this._pre(inited, MailPop3Cmd.USER, user);
        let a = this._pre(inited, MailPop3Cmd.PASS, passWord);
        if (!a.startsWith(RSP_OK)) {
            this.drop(null);
            throw new Error(a);
        }
        return true;
    }
    _authDigest(inited, user, passWord) {
        let a = this._pre(inited, MailPop3Cmd.APOP, user, hash.md5(Buffer.from(this.apopTimeStamp + passWord)).digest("hex"));
        if (!a.startsWith(RSP_OK)) {
            return this._authNormal(inited, user, passWord);
        }
        return true;
    }
    stat() {
        let a = this.sendCommand(MailPop3Cmd.STAT)[0].replace(RSP_OK, "").trim();
        return a.split(" ").forEach((e, i, r) => {
            r[i] = Number(e);
        });
    }
    uidl() {
        let a = this.sendCommand(MailPop3Cmd.UIDL);
        a.shift();
        let rets = [];
        a.forEach(e => {
            let r = e.split(" ");
            rets.push({ i: Number(r[0]), v: r[1] });
        });
        return rets;
    }
    list() {
        let a = this.sendCommand(MailPop3Cmd.LIST);
        a.shift();
        let rets = [];
        a.forEach(e => {
            let r = e.split(" ");
            rets.push({ i: Number(r[0]), v: Number(r[1]) });
        });
        return rets;
    }
    top(no, line) {
        let rsp = line > 0 ? this.sendCommand(MailPop3Cmd.TOP, no, line) : this.sendCommand(MailPop3Cmd.TOP, no);
        rsp.shift();
        return rsp.join(this.stream.EOL);
    }
    retr(no) {
        let rsp = this.sendRcv1(MailPop3Cmd.RETR, no);
        if (rsp.startsWith(RSP_OK)) {
            if (rsp == RSP_OK) {
                return this.readMoreLine().join(this.stream.EOL);
            }
            let n = Number(rsp.split(' ')[1]);
            return this.readSize(n + 5).substr(0, n);
        }
        return "";
    }
    dele(num) {
        this.sendRcv1(MailPop3Cmd.DELE, num);
        return true;
    }
    rest() {
        this.sendRcv1(MailPop3Cmd.RSET);
        return true;
    }
    noop() {
        if (!this.sock) {
            return false;
        }
        this.sendRcv1(MailPop3Cmd.NOOP);
        return true;
    }
    quit() {
        if (this.sock) {
            this.stream.writeLine(MailPop3Cmd.QUIT);
            this.stream.flush();
            this.drop(null);
        }
    }
    writeCmd(inited, cmd, ...args) {
        if (!inited && !this.sock) {
            this.connect();
        }
        this.stream.writeLine([cmd, ...args].join(' '));
    }
    readSize(n) {
        let r = this.stream.readText(n);
        if (r == null) {
            this.drop(null);
            throw new Error("io_error");
        }
        return r;
    }
    _pre(inited, cmd, ...args) {
        this.writeCmd(inited, cmd, ...args);
        let rsp = this.stream.readLine();
        if (rsp == null) {
            this.drop(null);
            throw new Error("io_error");
        }
        return rsp;
    }
    sendRcv1(cmd, ...args) {
        this.writeCmd(false, cmd, ...args);
        let rsp = this.stream.readLine();
        if (rsp == null) {
            this.drop(null);
            throw new Error("io_error");
        }
        return rsp;
    }
    sendCommand(cmd, ...args) {
        let rsp = this.sendRcv1(cmd, ...args);
        if (rsp.startsWith(RSP_OK)) {
            if (cmd == MailPop3Cmd.LIST || cmd == MailPop3Cmd.UIDL || cmd == MailPop3Cmd.TOP || cmd == MailPop3Cmd.RETR) {
                return this.readMoreLine([rsp]);
            }
        }
        return [rsp];
    }
    readMoreLine(arr) {
        arr = arr ? arr : [];
        do {
            let tmp = this.stream.readLine();
            if (tmp == null) {
                this.drop(null);
                throw new Error("io_error");
            }
            if (tmp == ".") {
                return arr;
            }
            arr.push(tmp);
        } while (true);
        return arr;
    }
    drop(e, sock) {
        if (this.sock) {
            this.sock.close();
            this.sock = null;
        }
        if (sock) {
            sock.close();
        }
        this.stream = null;
        if (this.conEvt) {
            let evt = this.conEvt;
            this.conEvt = null;
            evt["_err_"] = e;
            evt.set();
        }
    }
}
exports.MailPop3 = MailPop3;
const RSP_OK = "+OK";
const RSP_ERR = "-Err";
var MailPop3Cmd;
(function (MailPop3Cmd) {
    MailPop3Cmd["USER"] = "USER";
    MailPop3Cmd["PASS"] = "PASS";
    MailPop3Cmd["APOP"] = "APOP";
    MailPop3Cmd["STAT"] = "STAT";
    MailPop3Cmd["UIDL"] = "UIDL";
    MailPop3Cmd["LIST"] = "LIST";
    MailPop3Cmd["RETR"] = "RETR";
    MailPop3Cmd["DELE"] = "DELE";
    MailPop3Cmd["RSET"] = "RSET";
    MailPop3Cmd["TOP"] = "TOP";
    MailPop3Cmd["NOOP"] = "NOOP";
    MailPop3Cmd["QUIT"] = "QUIT";
})(MailPop3Cmd = exports.MailPop3Cmd || (exports.MailPop3Cmd = {}));
