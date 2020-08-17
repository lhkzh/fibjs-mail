import * as util from "util";

export function parseBase64Charset(s: string) {
    if (s.startsWith("=?") && s.endsWith("?=") || (s.startsWith('"=?') && s.endsWith('?="'))) {
        let a = s.split('?');
        return Buffer.from(a[a.length - 2], "base64").toString(a[1]);
    }
    return s;
}

export function parseMailboxs(s: string) {
    var a = s.split(', ');
    var n: Array<{ name: string, addr: string }> = [];
    for (var i = 0; i < a.length; i++) {
        var t = a[i].split(' ');
        if (t.length > 1) {
            var name = parseBase64Charset(t[0]);
            var addr = t[1].replace("<", "").replace(">", "");
            n.push({name: name, addr: addr});
        } else {
            n.push({name: '', addr: a[i]})
        }
    }
    return n;
}

export function parseMailData(s) {
    var d = splitDoc(s);
    return {headers: d.headers, body: parseBody(d.body, d.headers)};
}

export function splitDoc(s: string) {
    var bodyStart = s.search(regexes.doubleNewLine);
    if (bodyStart < 0) {
        let end = s.lastIndexOf("\r\n");
        if (end > 0) {
            bodyStart = end;
        }
    }
    let header = s.substring(0, bodyStart);
    let body = s.substring(bodyStart).trim();
    return {
        headers: splitHeader(header),
        body: body
    };
}

export function splitHeader(headerBlock: string) {
    var result = {};
    if (headerBlock === '') {
        return result;
    }
    var arr = headerBlock.split("\r\n");
    var headers: { [index: string]: any } = {};
    for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        var j = s.indexOf(':');
        var h = s.substr(0, j);
        var e = parseBase64Charset(s.substr(j + 2).trim());
        while ((i + 1) < arr.length && arr[i + 1].charAt(0).trim().length == 0) {
            i++;
            e += parseBase64Charset(arr[i].trim());
        }
        headers[h] = e;
    }
    if (headers['Subject']) headers['Subject'] = parseBase64Charset(headers['Subject']);
    if (headers['From']) headers['From'] = parseMailboxs(headers['From']);
    if (headers['To']) headers['To'] = parseMailboxs(headers['To']);
    if (headers['Cc']) headers['Cc'] = parseMailboxs(headers['Cc']);
    if (headers['Bcc']) headers['Bcc'] = parseMailboxs(headers['Bcc']);
    if (headers['Reply-To']) headers['Reply-To'] = parseMailboxs(headers['Reply-To']);
    // headers['Date'] = new Date(Date.parse(headers['Date']));
    return headers;
}

function parseBody(bodyBlock: string, headers: any) {
    if (!bodyBlock || bodyBlock === '') {
        return '';
    }
    var encoding = headers['Content-Transfer-Encoding'] || '';
    if (encoding === 'base64') {
        bodyBlock = Buffer.from(bodyBlock, encoding).toString();
    }
    var content_type = headers['Content-Type'] || ""
    var mainType = content_type.split(/\//, 1);
    var bound = content_type.split('boundary=');
    var boundaries = null;
    if (bound.length > 1) {
        boundaries = '--' + bound[1].replace(/"/g, '');
        if (boundaries.indexOf(';') > -1) {
            bound = boundaries.split(';');
            boundaries = bound[0];
        }
    }

    switch (mainType[0]) {
        case 'text':
            return parseTextBody(bodyBlock);
            break;
        case 'text':
            return parseTextBody(bodyBlock);
            break;
        case 'multipart':
            return parseMultiPart(bodyBlock, boundaries);
            break;
        default:
            return parseTextBody(bodyBlock);
            break;
    }
}

function parseTextBody(bodyBlock) {
    return bodyBlock.trim();
}
function trim_split_block(bs) {
    let arr = bs.split(/\r\n|\n/g).filter(e=>e.length>0 && e.startsWith('--')==false);
    let ret = [];
    for(var i=0;i<arr.length;i++){
        let s = arr[i];
        while((i+1)<arr.length && arr[i+1].charAt(0).trim().length==0){
            s+=arr[i+1].trim();
            i++;
        }
        ret.push(s);
    }
    return ret;
}
function splitMultiPart(s:string, boundaries:string) {
    let a = s.split(boundaries), end=a[a.length-1];
    if(end.length==0 || end=='--'){
        a.pop();
    }
    let child_boundaries = null;
    a.some((e,i)=>{
        if(i<2 && e.includes('boundary=')){
            let tmp = e.split(/\r\n|\n/), tmp_at:number=-1;
            for(var j=0;j<tmp.length;j++){
                if(tmp[j].includes('boundary=')){
                    child_boundaries = tmp[j].split('boundary=')[1].split(';')[0].replace(/"/g, '').trim();
                    tmp_at = j;
                    break;
                }
            }
            if(tmp_at>0){
                a[i] = tmp.slice(tmp_at+1).join('\n').replace(child_boundaries+'--','');
                a[i] = replaceAll(a[i], child_boundaries, boundaries);
            }
            return true;
        }
    });
    if (child_boundaries) {
        return splitMultiPart(a.join(boundaries), boundaries);
    }
    return a;
}
function replaceAll(src, s1, s2) {
    return src.replace(new RegExp(s1, "gm"), s2);
}
function parseMultiPart(bodyBlock: string, boundaries: string) {
    let frames = [];
    splitMultiPart(bodyBlock, boundaries).forEach(theBlock=>{
        if (theBlock.length == 0) return;
        let contentType: string;
        let contentEncoding: string;
        let content: any;
        let filename: string;
        let charset = "utf-8";
        let block_lines = trim_split_block(theBlock);
        for(let j=0;j<block_lines.length;j++){
            let e = block_lines[j];
            if (e.startsWith("Content-Type: ")) {
                let tmp = e.substr(13).split(';').map(e=>e.trim());
                contentType = tmp.shift();
                if(tmp.length>0){
                    tmp.forEach(e2=>{
                        let t2=e2.split('=').map(e=>e.trim());
                        if(t2[0]=='charset'){
                            charset = t2[1];
                            if(charset.charAt(0)=='"'){
                                charset = charset.substr(1,charset.length-2);
                            }
                        }
                    })
                }
            } else if (e.startsWith("Content-Transfer-Encoding:")) {
                contentEncoding = e.substr(26).trim();
            } else if (e.startsWith('Content-Disposition:')) {
                let tmp = e.substr(13).split(';').map(e=>e.trim());
                tmp.forEach(e2=>{
                    let t2=e2.split('=').map(e=>e.trim());
                    if(t2[0]=='filename'){
                        filename=t2[1].trim();
                        if(filename.charAt(0)=='"'){
                            filename = filename.substr(1,filename.length-2);
                        }
                    }
                });
            } else if (!e.includes(': ')) {
                if (!content) {
                    content = e.trim();
                } else {
                    content += e.trim();
                }
            }
        }
        // console.warn(contentEncoding,contentType,charset,filename,content)
        if (!content || (!contentEncoding && !contentType))
            return;
        if (contentEncoding == "base64") {
            content = Buffer.from(content, contentEncoding);
            if (filename) {
                content = {contentType: contentType, filename: filename, data: content};
            } else {
                // if(contentType.startsWith("text/"))
                content = {contentType: contentType, data: content.toString(charset)};
            }
        } else if (contentEncoding == "quoted-printable") {
            content = content.toString()
                // https://tools.ietf.org/html/rfc2045#section-6.7, rule 3:
                // “Therefore, when decoding a `Quoted-Printable` body, any trailing white
                // space on a line must be deleted, as it will necessarily have been added
                // by intermediate transport agents.”
                .replace(/[\t\x20]$/gm, '')
                // Remove hard line breaks preceded by `=`. Proper `Quoted-Printable`-
                // encoded data only contains CRLF line  endings, but for compatibility
                // reasons we support separate CR and LF too.
                .replace(/=(?:\r\n?|\n|$)/g, '')
                // Decode escape sequences of the form `=XX` where `XX` is any
                // combination of two hexidecimal digits. For optimal compatibility,
                // lowercase hexadecimal digits are supported as well. See
                // https://tools.ietf.org/html/rfc2045#section-6.7, note 1.
                .replace(/=([a-fA-F0-9]{2})/g, function ($0, $1) {
                    return String.fromCharCode(parseInt($1, 16));
                });
            content = {contentType: contentType, data: content.toString()};
        } else {
            content = {contentType: contentType, data: content.toString()};
        }
        frames.push(content);
    });
    if (frames.length == 1) {
        if (frames[0].contentType.startsWith("text/")) {
            return frames[0].data;
        }
    }
    return frames;
}

/* From PHP.js - http://phpjs.org/functions/quoted_printable_decode/ */
function decodeQuotedPrintable(text) {
    var RFC2045Decode1 = /=\r\n/gm,
        // Decodes all equal signs followed by two hex digits
        RFC2045Decode2IN = /=([0-9A-F]{2})/gim,
        // the RFC states against decoding lower case encodings, but following apparent PHP behavior
        // RFC2045Decode2IN = /=([0-9A-F]{2})/gm,
        RFC2045Decode2OUT = function (sMatch, sHex) {
            return String.fromCharCode(parseInt(sHex, 16));
        };
    return text.replace(RFC2045Decode1, '')
        .replace(RFC2045Decode2IN, RFC2045Decode2OUT);
}

const regexes = {
    doubleNewLine: /\r?\n\r?\n/,
}