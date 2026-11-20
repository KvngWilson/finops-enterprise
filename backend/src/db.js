import { MongoClient } from 'mongodb';
export const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/?replicaSet=rs0');
export const db = client.db(process.env.MONGODB_DATABASE || 'finops');
export const clients = db.collection('clients'), accounts = db.collection('accounts'), transactions = db.collection('transactions');
export async function connect(){
 await client.connect();
 for(const [c,keys] of [[clients,['clientId','registrationNumber']],[accounts,['accountId','accountNumber']],[transactions,['transactionId','referenceNumber']]]) for(const key of keys) await c.createIndex({[key]:1},{unique:true});
 await transactions.createIndex({idempotencyKey:1},{unique:true,partialFilterExpression:{idempotencyKey:{$type:'string'}}});
 await transactions.createIndex({createdAt:-1,transactionId:-1});
 await accounts.createIndex({clientId:1});
}
