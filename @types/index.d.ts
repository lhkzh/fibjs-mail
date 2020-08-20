/// <reference types="@fibjs/types" />
import {MailData} from "../src/MailData";
import {MailSender} from "../src/MailSender";
import {MailPop3} from "../src/MailPop3";
import {parseBase64Charset,parseMailboxs,parseMailData,parseMailHeaders} from "../src/fns";

export{
    MailData,
    MailSender,
    MailPop3,

    parseBase64Charset,parseMailboxs,parseMailData,parseMailHeaders
}