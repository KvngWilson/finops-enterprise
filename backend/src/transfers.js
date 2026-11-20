import {randomUUID,createHash} from 'node:crypto';
import {client,accounts,transactions} from './db.js';
import {fields,id,money,str,choice,metadata,fail,transferRejection,clean} from './domain.js';
export async function initiate(body,key){
 fields(body,['sourceAccountId','destinationAccountId','amountMinor','currency','description']);
 key=str(key,'Idempotency-Key',128);
 const input={sourceAccountId:id(body.sourceAccountId),destinationAccountId:id(body.destinationAccountId),amountMinor:money(body.amountMinor,true),currency:choice(body.currency,'currency',metadata.currencies),description:str(body.description,'description',500)};
 if(input.sourceAccountId===input.destinationAccountId)fail(400,'VALIDATION','Accounts must differ');
 const requestHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const replay=async()=>{const old=await transactions.findOne({idempotencyKey:key},{projection:clean});if(old&&old.requestHash!==requestHash)fail(409,'IDEMPOTENCY_CONFLICT','Key already used with a different request');return old;};
 const old=await replay();if(old)return {record:old,replayed:true};
 const a=await accounts.findOne({accountId:input.sourceAccountId}),b=await accounts.findOne({accountId:input.destinationAccountId});
 if(!a||!b)fail(404,'NOT_FOUND','Account not found');
 const record={...input,transactionId:randomUUID(),referenceNumber:`TXN-${randomUUID()}`,transactionType:'Transfer',status:'Pending',createdAt:new Date().toISOString(),processedAt:null,rejectionReason:null,idempotencyKey:key,requestHash};
 try{await transactions.insertOne({...record});return {record,replayed:false};}catch(e){if(e.code!==11000)throw e;const existing=await replay();if(!existing)throw e;return {record:existing,replayed:true};}
}
export async function processTransfer(transactionId){
 id(transactionId); const session=client.startSession();
 try{return await session.withTransaction(async()=>{
 const t=await transactions.findOne({transactionId},{session,projection:clean});if(!t)fail(404,'NOT_FOUND','Transaction not found');
 if(t.status!=='Pending')return t;
 const a=await accounts.findOne({accountId:t.sourceAccountId},{session});const b=await accounts.findOne({accountId:t.destinationAccountId},{session});
 const rejectionReason=transferRejection(t,a,b);const result={status:rejectionReason?'Rejected':'Completed',processedAt:new Date().toISOString(),rejectionReason};
 if(!rejectionReason){
 const debit=await accounts.updateOne({accountId:a.accountId,status:'Active',currency:t.currency,balanceMinor:{$gte:t.amountMinor}},{$inc:{balanceMinor:-t.amountMinor}},{session});
 const credit=await accounts.updateOne({accountId:b.accountId,status:'Active',currency:t.currency,balanceMinor:{$lte:Number.MAX_SAFE_INTEGER-t.amountMinor}},{$inc:{balanceMinor:t.amountMinor}},{session});
 if(debit.modifiedCount!==1||credit.modifiedCount!==1)fail(409,'CONCURRENT_CHANGE','Account changed; retry processing');
 }
 const updated=await transactions.updateOne({transactionId,status:'Pending'},{$set:result},{session});if(updated.modifiedCount!==1)fail(409,'CONCURRENT_CHANGE','Transaction changed; retry');return {...t,...result};
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});}finally{await session.endSession();}
}
