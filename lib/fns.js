"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function parseBase64Charset(s) {
    if (s.startsWith("=?") && s.endsWith("?=") || (s.startsWith('"=?') && s.endsWith('?="'))) {
        let a = s.split('?');
        return Buffer.from(a[a.length - 2], "base64").toString(a[1]);
    }
    return s;
}
exports.parseBase64Charset = parseBase64Charset;
function parseMailboxs(s) {
    var a = s.split(', ');
    var n = [];
    for (var i = 0; i < a.length; i++) {
        var t = a[i].split(' ');
        if (t.length > 1) {
            var name = parseBase64Charset(t[0]);
            var addr = t[1].replace("<", "").replace(">", "");
            n.push({ name: name, addr: addr });
        }
        else {
            n.push({ name: '', addr: a[i] });
        }
    }
    return n;
}
exports.parseMailboxs = parseMailboxs;
function parseMailData(s) {
    var d = splitDoc(s);
    return { headers: d.headers, body: parseBody(d.body, d.headers) };
}
exports.parseMailData = parseMailData;
function splitDoc(s) {
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
exports.splitDoc = splitDoc;
function splitHeader(headerBlock) {
    var result = {};
    if (headerBlock === '') {
        return result;
    }
    var arr = headerBlock.split("\r\n");
    var headers = {};
    for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        var j = s.indexOf(': ');
        var h = s.substr(0, j);
        var e = s.substr(j + 2);
        while ((i + 1) < arr.length && arr[i + 1].charAt(0).trim().length == 0) {
            i++;
            e += arr[i].trim();
        }
        headers[h] = e;
    }
    if (headers['Subject'])
        headers['Subject'] = parseBase64Charset(headers['Subject']);
    if (headers['From'])
        headers['From'] = parseMailboxs(headers['From']);
    if (headers['To'])
        headers['To'] = parseMailboxs(headers['To']);
    if (headers['Cc'])
        headers['Cc'] = parseMailboxs(headers['Cc']);
    if (headers['Bcc'])
        headers['Bcc'] = parseMailboxs(headers['Bcc']);
    if (headers['Reply-To'])
        headers['Reply-To'] = parseMailboxs(headers['Reply-To']);
    // headers['Date'] = new Date(Date.parse(headers['Date']));
    console.warn(headers);
    return headers;
}
exports.splitHeader = splitHeader;
function parseBody(bodyBlock, headers) {
    if (!bodyBlock || bodyBlock === '') {
        return '';
    }
    var encoding = headers['Content-Transfer-Encoding'] || '';
    if (encoding === 'base64') {
        bodyBlock = Buffer.from(bodyBlock, encoding).toString();
    }
    var content_type = headers['Content-Type'] || "";
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
function parseMultiPart(bodyBlock, boundaries) {
    /* Get MIME container starting points */
    var indices = getIndicesOf(boundaries, bodyBlock);
    var frames = [];
    /* Grab each container from the body block */
    for (let i = 0; i < indices.length; i++) {
        let theBlock = bodyBlock.substring(indices[0 + i] + boundaries.length, indices[1 + i]).trim();
        if (theBlock.length == 0)
            continue;
        let contentType;
        let contentEncoding;
        let content;
        let filename;
        let charset = "utf-8";
        theBlock.split("\r\n").forEach(e => {
            if (e.length == 0)
                return;
            if (!contentType || !contentEncoding) {
                if (e.startsWith("Content-Type: ")) {
                    contentType = e.substr("Content-Type: ".length);
                    if (e.includes('charset="')) {
                        charset = e.split('charset="')[1].split('"')[0];
                    }
                }
                else if (e.startsWith("Content-Transfer-Encoding: ")) {
                    contentEncoding = e.substr("Content-Transfer-Encoding: ".length);
                }
                else if (e.includes('charset="')) {
                    charset = e.split('charset="')[1].split('"')[0];
                }
            }
            else {
                if (!filename && e.startsWith('Content-Disposition: attachment;filename="')) {
                    filename = e.substr('Content-Disposition: attachment;filename="'.length);
                }
                if (!content) {
                    content = e.trim();
                }
                else {
                    content += e.trim();
                }
            }
        });
        if (!content)
            continue;
        if (contentEncoding == "base64") {
            content = Buffer.from(content, contentEncoding);
            if (filename) {
                content = { contentType: contentType, filename: filename, data: content };
            }
            else {
                // if(contentType.startsWith("text/"))
                content = { contentType: contentType, data: content.toString(charset) };
            }
        }
        else {
            content = { contentType: contentType, data: content.toString() };
        }
        frames.push(content);
    }
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
function getIndicesOf(searchStr, str) {
    var startIndex = 0, searchStrLen = searchStr.length;
    var index, indices = [];
    while ((index = str.indexOf(searchStr, startIndex)) > -1) {
        indices.push(index);
        startIndex = index + searchStrLen;
    }
    return indices;
}
const regexes = {
    newLine: /\r\n|\r|\n/,
    doubleNewLine: /\r?\n\r?\n/,
    headerAttribute: /:(.+)?/,
    fold: /\r\n|\r|\n(?:[ \t]+)/g,
    email: /(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/g,
    ipAddr: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
    header: /^(.+): ((.|\r\n\s)+)\r\n/mg,
};