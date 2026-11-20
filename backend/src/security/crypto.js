import {randomBytes,scrypt as raw,timingSafeEqual,createHash} from 'node:crypto';import {promisify} from 'node:util';
const scrypt=promisify(raw);export const secret=()=>randomBytes(32).toString('base64url');export const digest=x=>createHash('sha256').update(x).digest('hex');
export async function hashPassword(p){if(typeof p!=='string'||p.length<12||p.length>128)throw Object.assign(new Error('Password must contain 12–128 characters'),{status:400});const salt=secret();return salt+':'+(await scrypt(p,salt,64)).toString('hex');}
export async function verifyPassword(p,h){if(typeof p!=='string'||p.length>128||!h)return false;const [salt,key]=h.split(':');if(!salt||!/^[a-f0-9]{128}$/.test(key??''))return false;return timingSafeEqual(Buffer.from(key,'hex'),await scrypt(p,salt,64));}
