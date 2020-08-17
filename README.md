邮件内容组装，以及fibjs-smtp发送  

fibjs-smtp-simple-use  
var s = net.openSmtp("tcp://smtp.qq.com:25");  
s.login('yourqq@qq.com', 'yourqq_account_auth_smtp_key');  
s.command('HELO','localhost');  
s.command('MAIL FROM:','<yourqq@qq.com>');  
s.command('RCPT TO:','<to@qq.com>');  
s.data('hi, i am simple data. @by fibjs');  
s.quit();  

**use-mime**  
<pre>
<code>
const MailSender = require("fibjs-mail").MailSender;
const MailPop3 = require("fibjs-mail").MailPop3;  
var mailData = new MailData();
mailData.recipients = [{name:'demo_a',addr:"demo_a@qq.com"},{name:'demo_b',addr:"demo_b@qq.com"},{name:'demo_c',addr:"demo_c@qq.com",type:'Cc'}];
mailData.message = "Hello <b>I am Fiber</b>. lalalalala.";
mailData.subject = "i am a demo";
mailData.replys = [{name: 'demo_reply', addr:"demo_reply@qq.com"}];
mailData.attachments = [{
    type:"image/jpeg",
    filename:"screen20200801.jpg",
    base64Data:require("fs").readFile("E:/tmp/20200801.jpg").toString("base64")
}];

var sender=new MailSender('yourqq@qq.com', 'yourqq_account_auth_smtp_key');
sender.send(mailData)  

</code>
</pre>

**use pop3**
<pre>
<code>
const MailData = require("fibjs-mail").MailData;  
const parseMailData = require("fibjs-mail").parseMailData;  
var reader=new MailPop3("tcp://pop.qq.com:110",{user:"yourqq@qq.com",pass:"authcode"});  
console.log(reader.list())   
console.log(parseMailData(reader.retr(1)))  
</code>
</pre>