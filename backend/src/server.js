import {initializeSecurity} from "./security/index.js";
import {upgradeRisk} from "./risk.js";
import {connect,client} from './db.js';import {createApp} from './app.js';
await connect(); await upgradeRisk(); await initializeSecurity(); const server=createApp().listen(Number(process.env.PORT||3000),'0.0.0.0');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(async()=>{await client.close();process.exit(0);}));
