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
export function parseMailHeaders(s) {
    var bodyStart = s.search(regexes.doubleNewLine);
    if (bodyStart < 0) {
        let end = s.lastIndexOf("\r\n");
        if (end > 0) {
            bodyStart = end;
        }
    }
    let header = s.substring(0, bodyStart>0?bodyStart:s.length);
    return splitHeader(header);
}
export function splitDoc(s: string) {
    var bodyStart = s.search(regexes.doubleNewLine);
    if (bodyStart < 0) {
        let end = s.lastIndexOf("\r\n");
        if (end > 0) {
            bodyStart = end;
        }
    }
    let header = s.substring(0, bodyStart>0?bodyStart:s.length);
    let body = bodyStart>0?s.substring(bodyStart).trim():"";
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
    var arr = headerBlock.split(regexes.allLine);
    var headers: { [index: string]: any } = {};
    for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        var j = s.indexOf(':');
        var h = s.substr(0, j);
        var e = parseBase64Charset(s.substr(j + 1).trim());
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
    if (encoding === 'base64' && /:|-|_/.test(bodyBlock)==false) {
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
    var lines = bs.split(regexes.allLine);
    var ret = [];
    for(var i=0;i<lines.length;i++){
        let s = lines[i];
        if(s.startsWith('Content-')){
            while ((i + 1) < lines.length && lines[i + 1].charAt(0).trim().length == 0 && lines[i + 1].includes('=')) {
                s += lines[i + 1];
                i++;
            }
            ret.push(s);
        }else{
            ret.push(lines.slice(i).join('\n'));
            break;
        }
    }
    return ret;
}
//根据boundary分割
function split_boundary(s:string, boundaries:string, stepFirst=true) {
    let a = clean_sub_boundary(s, boundaries).split(boundaries), first = a[0], end = a[a.length - 1];
    if (stepFirst && a.length > 0 && first.includes('Content-') == false) {
        a.shift();
    }
    if (a.length > 0 && a[a.length-1].trim() == '--') {
        a.pop();
    }
    return a;
}
//替换子项中产生的boundary
function clean_sub_boundary(body:string,root_boundary:string) {
    do{
        // console.warn(body.substr(0,200))
        let idx = body.indexOf('boundary="');
        if(idx>0){
            let idx_mh = body.indexOf(': ',idx-42);
            if(idx_mh>0){
                let idx_ct = body.indexOf('Content-Type',idx_mh-12);
                if(idx_ct>0){
                    let idx_end = body.indexOf('"',idx+10);
                    if(idx_end>0 && idx_end-idx_mh<128){
                        let ctb = body.substring(idx_ct,idx_end+1);
                        let sub_boundary = body.substring(idx+10,idx_end);
                        body = body.replace(ctb,'');
                        body = replaceAll(body, '\n--'+sub_boundary+'--','')
                        body = replaceAll(body, '\n--'+sub_boundary,'\n'+root_boundary);
                        continue;
                    }
                }
            }
        }
        break;
    }while(true)
    return body;
}
function replaceAll(src, s1, s2) {
    return src.replace(new RegExp(s1, "gm"), s2);
}
function parseMultiPart(bodyBlock: string, boundaries: string) {
    let frames = [];
    split_boundary(bodyBlock, boundaries).forEach(theBlock=>{
        theBlock=theBlock.trim();
        if (theBlock.length == 0) return;
        let contentType: string;
        let contentEncoding: string;
        let filename: string;
        let charset = "utf-8";
        let block_lines = trim_split_block(theBlock);
        let content = block_lines.pop();
        if(content.length<128 && content.startsWith('Content-') && content.indexOf(':')>0){
            return;
        }
        for(let j=0;j<block_lines.length;j++){
            let e = block_lines[j];
            if (e.startsWith("Content-Type:")) {
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
                content = {contentType: contentType, data: content.toString(charset.toLowerCase())};
            }
        } else if (contentEncoding == "quoted-printable") {
            content = decodeQuotedPrintable(content.trim(), charset.toLowerCase());
            content = {contentType: contentType, data: content};
        } else {
            content = {contentType: contentType, data: content};
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

function decodeQuotedPrintable(text, charset:string="utf-8") {
    var arr=[],c,n;
    for(var i=0;i<text.length;i++){
        c=text.charCodeAt(i);
        if(c==61){//'='
            n=text.charAt(++i);
            if(n=='\n'||n=='\r'){
                continue;
            }
            arr.push(parseInt(n+text.charAt(++i),16));
        }else{
            arr.push(c);
        }
    }
    return new Buffer(arr).toString(charset);
}

const regexes = {
    doubleNewLine: /\r?\n\r?\n/,
    allLine:/\r\n|\n|\r/g,
}