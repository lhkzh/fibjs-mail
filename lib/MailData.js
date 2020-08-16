"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 邮件内容组装器. 支持（html、附件、抄送、密送）
 * net.openSmtp("tcp://smtp.qq.com:25");// 25一般是不加密【可升级加密】 可选465[SSL]或587[TSL]
 * net.openSmtp("ssl://smtp.qq.com:465");
 */
class MailData {
    constructor(opts) {
        if (opts) {
            for (var k in opts) {
                this[k] = opts[k];
            }
        }
    }
    //添加-发件人
    setSender(name, addr) {
        this.sender = { name: name, addr: addr };
        return this;
    }
    //添加-收件人
    addRecipient(name, addr, type) {
        let e = { name: name, addr: addr, type: type || 'To' };
        if (!this.recipients)
            this.recipients = [e];
        else
            this.recipients.push(e);
        return this;
    }
    //添加-回复人
    addReply(name, addr) {
        let e = { name: name, addr: addr };
        if (!this.replys)
            this.replys = [e];
        else
            this.replys.push(e);
        return this;
    }
    //设置 标题和内容
    edit(subject, message) {
        this.subject = subject;
        this.message = message;
        return this;
    }
    //添加附件
    addAttachment(type, filename, base64Data) {
        let e = { type: type, filename: filename, base64Data: base64Data };
        if (!this.attachments)
            this.attachments = [e];
        else
            this.attachments.push(e);
        return this;
    }
    /**
     * 进行编码，返回内容
     */
    encode() {
        let timeNow = Date.now(), timeStr = new Date(timeNow).toUTCString().replace(/GMT|UTC/gi, '+0000');
        let lines = [];
        if (this.sender) {
            lines.push('From: ' + encodeMailboxs(this.sender));
        }
        if (this.recipients) {
            let tos = this.recipients.filter(e => !e.type || e.type == 'To');
            if (tos.length > 0) {
                lines.push('To: ' + encodeMailboxs(tos));
            }
            let css = this.recipients.filter(e => e.type && e.type == 'Cc');
            if (tos.length > 0) {
                lines.push('Cc: ' + encodeMailboxs(css));
            }
            let bcss = this.recipients.filter(e => e.type && e.type == 'Bcc');
            if (bcss.length > 0) {
                lines.push('Bcc: ' + encodeMailboxs(bcss));
            }
        }
        if (this.replys) {
            lines.push('Reply-To: ' + encodeMailboxs(this.replys));
        }
        if (this.subject) {
            lines.push('Subject: ' + '=?UTF-8?B?' + encodeBase64(this.subject) + '?=');
        }
        lines.push('MIME-Version: 1.0');
        lines.push('Date: ' + timeStr);
        lines.push('Message-ID: ' + createMsgID(timeNow, this.getSenderHost()));
        if (this.headers) {
            for (var [k, v] of Object.entries(this.headers)) {
                lines.push(`${k}: ${v}`);
            }
        }
        let boundary = this.genNewBoundary(timeNow);
        let boundaryMixed = '--' + boundary;
        let attachments = this.encodeAttachments(boundaryMixed);
        lines.push('Content-Type: multipart/mixed; boundary="' + boundary + '"', "");
        if (this.message) {
            var msg = this.message;
            var ct_line = this.guessContentTypeLine(msg);
            lines.push(boundaryMixed, ct_line, "Content-Transfer-Encoding: base64", encodeBase64(msg));
            if (ct_line.indexOf('html') < 0) {
                var html_msg = msg.replace(/\r\n|\n/g, '<br>');
                if (html_msg != msg) {
                    ct_line = this.guessContentTypeLine(html_msg);
                    lines.push(boundaryMixed, ct_line, "Content-Transfer-Encoding: base64", encodeBase64(html_msg));
                }
            }
        }
        attachments.forEach(e => lines.push(e));
        return lines.join(EOL) + EOL;
    }
    //猜-邮件内容的-文本类型
    guessContentTypeLine(s) {
        if (s.includes('<') && s.includes('>')) {
            return 'Content-Type: text/html; charset="utf-8"';
        }
        return 'Content-Type: text/plain; charset="utf-8"';
    }
    //找个host
    getSenderHost() {
        if (this.sender) {
            return this.sender.addr.split('@')[1];
        }
        return this.host || "localhost";
    }
    //编码-附件
    encodeAttachments(boundaryMixed) {
        let lines = [];
        if (this.attachments && this.attachments.length > 0) {
            let attachments = this.attachments;
            attachments.forEach(e => {
                if (e.filename && e.base64Data) {
                    lines.push('');
                    lines.push(boundaryMixed);
                    lines.push('Content-Type: ' + (e.type || "application/octet-stream"));
                    lines.push('Content-Transfer-Encoding: base64');
                    lines.push('Content-Disposition: attachment;filename="' + e.filename + '"');
                    lines.push('');
                    lines.push(e.base64Data);
                }
            });
        }
        return lines;
    }
    genNewBoundary(timestamp) {
        let n = this["_boundary_"];
        if (n === undefined)
            n = 0;
        n++;
        this["_boundary_"] = n;
        return `${n}${Math.random().toString(36).slice(2)}${timestamp}`;
    }
}
exports.MailData = MailData;
const EOL = '\r\n';
const ANAME = /^\w+$/;
function encodeMailboxs(mailboxes) {
    if (Array.isArray(mailboxes) == false) {
        mailboxes = [mailboxes];
    }
    return mailboxes.reduce(function (memo, obj, ind) {
        var name = obj.name || "";
        if (name.length < 1) {
            memo += obj.addr;
        }
        else {
            if (!ANAME.test(name)) {
                name = `=?UTF-8?B?${encodeBase64(name)}`;
            }
            memo += `${name} <${obj.addr}>`;
        }
        // memo += obj.name ? '"' + obj.name + '" <' + obj.addr + '>' : obj.addr
        if (mailboxes.length !== ind + 1)
            memo += ', ';
        return memo;
    }, '');
}
function createMsgID(timestamp, senderHost) {
    return `<${Math.random().toString(36).slice(2)}-${timestamp}@${senderHost}>`;
}
function encodeBase64(s) {
    // return require("base64").encode(s);
    return Buffer.from(s).toString('base64');
}
function generateBoundary() {
    var boundary = '------------------------';
    for (var i = 0; i < 16; i++) {
        boundary += Math.floor(Math.random() * 10).toString(16);
    }
    return boundary;
}
