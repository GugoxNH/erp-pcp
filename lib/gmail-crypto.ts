import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';

function key() {
 const value=process.env.GMAIL_TOKEN_ENCRYPTION_KEY??'';
 if(!/^[a-f0-9]{64}$/i.test(value))throw new Error('Falta configurar la clave de cifrado de Gmail.');
 return Buffer.from(value,'hex');
}
export function checkGmailEncryption(){key();}
export function sealGmail(value:string,owner:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 cipher.setAAD(Buffer.from(owner));
 const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function openGmail(value:string,owner:string){
 const [version,iv,tag,body,...extra]=value.split('.');
 if(version!=='v1'||!iv||!tag||!body||extra.length)throw new Error('Credencial de Gmail inválida.');
 const cipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64url'));
 cipher.setAAD(Buffer.from(owner));cipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8');
}
export function gmailStateHash(state:string){return createHash('sha256').update(state).digest('hex');}
