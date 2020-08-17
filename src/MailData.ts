/**
 * 邮件内容组装器. 支持（html、附件、抄送、密送）
 * net.openSmtp("tcp://smtp.qq.com:25");// 25一般是不加密【可升级加密】 可选465[SSL]或587[TSL]
 * net.openSmtp("ssl://smtp.qq.com:465");
 */
export class MailData {
    //发件人 '昵称'和'邮箱地址'
    public sender: { name: string, addr: string };
    //收件人 '昵称'和'邮箱地址'
    public recipients: { name: string, addr: string, type?:'To'|'Cc'|'Bcc'}[];
    //回复人 '昵称'和'邮箱地址'
    public replys: { name: string, addr: string }[];
    //主题
    public subject: string;
    //内容
    public message: string;
    //附件
    public attachments: { type: string, filename: string, base64Data: any }[];

    //额外-header
    public headers: { [index: string]: string };
    //发件人host，不设置则选择-senders[0].addr.host/localhost
    public host: string;

    constructor(opts?: {
        sender?: { name: string, addr: string },
        recipients?: { name: string, addr: string }[]
        subject?: string,
        message?: string,
        replys?: { name: string, addr: string }[]
        attachments?: { type: string, filename: string, base64Data: any }[]
    }) {
        if (opts) {
            for (var k in opts) {
                this[k] = opts[k];
            }
        }
    }

    //添加-发件人
    public setSender(name: string, addr: string) {
        this.sender = {name: name, addr: addr};
        return this;
    }

    //添加-收件人
    public addRecipient(name: string, addr: string, type?:'To'|'Cc'|'Bcc' ) {
        let e = {name: name, addr: addr, type:type||'To'};
        if (!this.recipients) this.recipients = [e];
        else this.recipients.push(e);
        return this;
    }

    //添加-回复人
    public addReply(name: string, addr: string) {
        let e = {name: name, addr: addr};
        if (!this.replys) this.replys = [e];
        else this.replys.push(e);
        return this;
    }

    //设置 标题和内容
    public edit(subject: string, message: string) {
        this.subject = subject;
        this.message = message;
        return this;
    }

    //添加附件
    public addAttachment(type: string, filename: string, base64Data: string) {
        let e = {type: type, filename: filename, base64Data: base64Data};
        if (!this.attachments) this.attachments = [e];
        else this.attachments.push(e);
        return this;
    }

    /**
     * 进行编码，返回内容
     */
    public encode(): string {
        let timeNow = Date.now(),
            timeStr = new Date(timeNow).toUTCString().replace(/GMT|UTC/gi, '+0000');
        let lines = []
        if (this.sender) {
            lines.push('From: ' + encodeMailboxs(this.sender))
        }
        if (this.recipients) {
            let tos = this.recipients.filter(e=>!e.type||e.type=='To');
            if(tos.length>0){
                lines.push('To: ' + encodeMailboxs(tos))
            }
            let css = this.recipients.filter(e=>e.type&&e.type=='Cc');
            if(tos.length>0){
                lines.push('Cc: ' + encodeMailboxs(css))
            }
            let bcss = this.recipients.filter(e=>e.type&&e.type=='Bcc');
            if(bcss.length>0){
                lines.push('Bcc: ' + encodeMailboxs(bcss))
            }
        }
        if (this.replys) {
            lines.push('Reply-To: ' + encodeMailboxs(this.replys))
        }
        if (this.subject) {
            lines.push('Subject: ' + '=?UTF-8?B?' + encodeBase64(this.subject) + '?=')
        }
        lines.push('MIME-Version: 1.0')
        lines.push('Date: ' + timeStr)
        lines.push('Message-ID: ' + createMsgID(timeNow, this.getSenderHost()));
        if (this.headers) {
            for (var [k, v] of Object.entries(this.headers)) {
                lines.push(`${k}: ${v}`);
            }
        }
        let boundary = genNewBoundary();
        let boundaryMixed = '--'+boundary;
        let attachments = this.encodeAttachments(boundaryMixed);
        lines.push('Content-Type: multipart/alternative; boundary="' + boundary+'"', "","This is a multi-part message in MIME format.","")
        if (this.message) {
            var msg = this.message.replace(/<\/?.+?>/g,"");
            var ct_line = this.guessContentTypeLine(msg);
            lines.push(boundaryMixed,
                ct_line,
                "Content-Transfer-Encoding: base64",'',
                encodeBase64(msg),'');
            let html_msg = this.message.replace(/\r\n|\n/g,'<br/>');
            if(html_msg!=msg){
                ct_line = this.guessContentTypeLine(html_msg);
                lines.push('',boundaryMixed,
                    ct_line,
                    "Content-Transfer-Encoding: base64",'',
                    encodeBase64(html_msg),'');
            }
        }
        attachments.forEach(e => lines.push(e));
        lines.push('',boundaryMixed)
        return lines.join(EOL) + EOL
    }

    //猜-邮件内容的-文本类型
    private guessContentTypeLine(s:string) {
        if (s.includes('<') && s.includes('>')) {
            return 'Content-Type: text/html; charset="utf-8"';
        }
        return 'Content-Type: text/plain; charset="utf-8"';
    }

    //找个host
    public getSenderHost() {
        if (this.sender) {
            return this.sender.addr.split('@')[1];
        }
        return this.host || "localhost";
    }

    //编码-附件
    private encodeAttachments(boundaryMixed) {
        let lines = []
        if (this.attachments && this.attachments.length > 0) {
            let attachments = this.attachments;
            attachments.forEach(e => {
                if (e.filename && e.base64Data) {
                    lines.push('')
                    lines.push(boundaryMixed)
                    lines.push('Content-Type: ' + (e.type||"application/octet-stream"))
                    lines.push('Content-Transfer-Encoding: base64')
                    lines.push('Content-Disposition: attachment;filename="' + e.filename + '"')
                    lines.push('')
                    lines.push(e.base64Data)
                }
            });
        }
        return lines;
    }
}

const EOL = '\r\n';
const ANAME = /^\w+$/;
function genNewBoundary() {
    let f = ()=>Math.random().toString(36).substr(2,8).toUpperCase();
    return '----=_NextPart_'+[f(),f(),Date.now().toString(32).toUpperCase().substr(1,8)].join('_')
}
function encodeMailboxs(mailboxes) {
    if (Array.isArray(mailboxes) == false) {
        mailboxes = [mailboxes];
    }
    return mailboxes.reduce(function (memo, obj, ind) {
        var name=obj.name || "";
        if(name.length<1){
            memo += obj.addr;
        }else{
            if(!ANAME.test(name)){
                name = `=?UTF-8?B?${encodeBase64(name)}?=`;
            }
            memo += `${name} <${obj.addr}>`;
        }
        // memo += obj.name ? '"' + obj.name + '" <' + obj.addr + '>' : obj.addr
        if (mailboxes.length !== ind + 1) memo += ', '
        return memo
    }, '');
}

function createMsgID(timestamp, senderHost) {
    return `<${Math.random().toString(36).slice(2)}-${timestamp}@${senderHost}>`;
}

function encodeBase64(s: string): string {
    // return require("base64").encode(s);
    return Buffer.from(s).toString('base64');
}