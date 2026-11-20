export class AppError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
export const fail=(status,code,message)=>{throw new AppError(status,code,message)};
export const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const metadata={industries:['Manufacturing','Construction','Transportation','Technology','Financial Services','Retail','Wholesale Distribution'],countries:['Canada','United States'],clientStatuses:['Active','Inactive','Suspended'],accountTypes:['Operating','Savings','Investment'],accountStatuses:['Active','Frozen','Closed'],currencies:['CAD','USD'],transactionStatuses:['Pending','Completed','Rejected'],transactionTypes:['Transfer']};
export function fields(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'INVALID_FIELDS','Unknown or invalid fields');}
export function str(v,k,max=200){if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,'VALIDATION',`Invalid ${k}`);return v.trim();}
export function choice(v,k,options){if(!options.includes(v))fail(400,'VALIDATION',`Invalid ${k}`);return v;}
export function id(v){if(typeof v!=='string'||!uuid.test(v))fail(400,'VALIDATION','Invalid UUID');return v;}
export function money(v,positive=false){if(!Number.isSafeInteger(v)||v<(positive?1:0))fail(400,'VALIDATION','Amount must be a safe integer in minor units');return v;}
export function transferRejection(t,a,b){if(!a||!b)return 'Account not found';if(a.accountId===b.accountId)return 'Accounts must differ';if(a.status!=='Active'||b.status!=='Active')return 'Both accounts must be active';if(a.currency!==t.currency||b.currency!==t.currency)return 'Currency mismatch';if(a.balanceMinor<t.amountMinor)return 'Insufficient funds';if(b.balanceMinor>Number.MAX_SAFE_INTEGER-t.amountMinor)return 'Destination balance overflow';return null;}
export const clean = {_id:0};
