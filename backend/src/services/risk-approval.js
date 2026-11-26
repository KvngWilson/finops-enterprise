import { randomUUID } from "node:crypto";
import { AppError } from "../domain/errors.js";
import { evaluateRiskPolicy } from "../domain/risk-engine.js";
import { createRiskRepositories } from "../repositories/risk-repositories.js";

const now = () => new Date();
const iso = (d = now()) => d.toISOString();
const fail = (status, code, message, fields) => { throw new AppError(status, code, message, fields); };
const RISK_RULES = [
  { ruleId:"RISK-001", description:"Transfer amount is at least 10,000 in the transaction currency", points:15, type:"amount", thresholdMajor:10000 },
  { ruleId:"RISK-002", description:"Transfer amount is at least 50,000 in the transaction currency", points:20, type:"amount", thresholdMajor:50000 },
  { ruleId:"RISK-003", description:"Transfer amount is at least 100,000 in the transaction currency", points:25, type:"amount", thresholdMajor:100000 },
  { ruleId:"RISK-004", description:"At least five completed outgoing transfers in the preceding 24 hours", points:15, type:"count", threshold:5 },
  { ruleId:"RISK-005", description:"Completed outgoing transfer volume in the preceding 24 hours is at least 100,000", points:20, type:"volume", thresholdMajor:100000 },
  { ruleId:"RISK-006", description:"Transfer amount exceeds 50% of the source account balance", points:15, type:"balanceRatio", threshold:0.5 },
  { ruleId:"RISK-007", description:"Source client status is not Active", points:30, type:"sourceClientStatus" },
  { ruleId:"RISK-008", description:"Destination client status is not Active", points:30, type:"destinationClientStatus" },
];
const DEFAULT_THRESHOLDS = [
  { level:"Low", min:0, max:24, approvalRequired:false },
  { level:"Medium", min:25, max:49, approvalRequired:true },
  { level:"High", min:50, max:74, approvalRequired:true },
  { level:"Critical", min:75, max:100, approvalRequired:true },
];
const APPROVAL_STAGES = {
  Low: [],
  Medium: ["OperationsReviewer"],
  High: ["OperationsReviewer","SeniorReviewer"],
  Critical: ["SeniorReviewer","ComplianceReviewer"],
};
const ACTORS = [
  { actorId:"ACTOR-OLIVIA-CHEN", name:"Olivia Chen", role:"OperationsReviewer", active:true },
  { actorId:"ACTOR-DANIEL-BROOKS", name:"Daniel Brooks", role:"SeniorReviewer", active:true },
  { actorId:"ACTOR-PRIYA-SHAH", name:"Priya Shah", role:"ComplianceReviewer", active:true },
  { actorId:"ACTOR-MORGAN-LEE", name:"Morgan Lee", role:"PolicyAdministrator", active:true },
  { actorId:"ACTOR-AVERY-PATEL", name:"Avery Patel", role:"SeniorReviewer", active:true },
  { actorId:"ACTOR-SOFIA-RIVERA", name:"Sofia Rivera", role:"ComplianceReviewer", active:true },
];
const DEFAULT_POLICY = {
  policyKey:"default-risk-v1", policyId:"RISK-POLICY-DEFAULT-CAD-USD", version:1, name:"Default Transfer Risk Policy",
  description:"Default additive risk scoring policy for CAD and USD transfers.",
  currencies:["CAD","USD"], status:"Active", effectiveFrom:iso(), effectiveTo:null,
  thresholds:DEFAULT_THRESHOLDS, rules:RISK_RULES, createdAt:iso(), updatedAt:iso(), createdBy:"SYSTEM",
};
const DEFAULT_APPROVAL_POLICY = {
  policyId:"APPROVAL-POLICY-DEFAULT", version:1, name:"Default Risk Approval Routing",
  status:"Active", routes:APPROVAL_STAGES, createdAt:iso(), updatedAt:iso(), createdBy:"SYSTEM",
};

function validateThresholds(thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length !== 4) fail(400,"INVALID_POLICY","Exactly four risk thresholds are required.");
  const sorted=[...thresholds].sort((a,b)=>a.min-b.min);
  let next=0;
  for (const t of sorted) {
    if (!Number.isInteger(t.min)||!Number.isInteger(t.max)||t.min!==next||t.max<t.min||t.max>100||t.level!==["Low","Medium","High","Critical"][sorted.indexOf(t)]||t.approvalRequired!==(t.level!=="Low"))
      fail(400,"INVALID_POLICY","Thresholds must cover 0–100 without gaps or overlaps.");
    next=t.max+1;
  }
  if(sorted.some((t,i)=>t.min!==DEFAULT_THRESHOLDS[i].min||t.max!==DEFAULT_THRESHOLDS[i].max))fail(400,"INVALID_POLICY","Assignment 4 fixes mandatory risk bands at 0–24, 25–49, 50–74, 75–100.");
  if(next!==101) fail(400,"INVALID_POLICY","Thresholds must cover the complete 0–100 score range.");
}
function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length < 8) fail(400,"INVALID_POLICY","All eight default risk rules must be configured.");
  const ids=new Set();
  for(const r of rules) {
    if(!r.ruleId||ids.has(r.ruleId)||!Number.isInteger(r.points)||r.points<0||r.points>100) fail(400,"INVALID_POLICY","Each rule needs a unique ID and integer points from 0 to 100.");
    if(!RISK_RULES.some(required=>required.ruleId===r.ruleId)) fail(400,"INVALID_POLICY",`Unsupported risk rule ${r.ruleId}.`);
    if(["RISK-001","RISK-002","RISK-003","RISK-005"].includes(r.ruleId) && !(Number.isFinite(r.thresholdMajor)&&r.thresholdMajor>0 || Number.isSafeInteger(r.thresholdMinor)&&r.thresholdMinor>0)) fail(400,"INVALID_POLICY",`${r.ruleId} requires a positive major- or minor-unit threshold.`);
    if(r.ruleId==="RISK-004" && (!Number.isInteger(r.threshold)||r.threshold<1)) fail(400,"INVALID_POLICY","RISK-004 requires a positive transaction-count threshold.");
    if(r.ruleId==="RISK-006" && !(typeof r.threshold==="number"&&r.threshold>=0&&r.threshold<=1)) fail(400,"INVALID_POLICY","RISK-006 threshold must be a ratio from 0 to 1.");
    ids.add(r.ruleId);
  }
  for(const r of RISK_RULES) if(!ids.has(r.ruleId)) fail(400,"INVALID_POLICY",`Missing required rule ${r.ruleId}.`);
}
function stageList(level, routes=APPROVAL_STAGES) {
  const roles=routes[level]??APPROVAL_STAGES[level]??[];
  if(!Array.isArray(roles)) fail(500,"INVALID_APPROVAL_POLICY",`Approval route for ${level} must be an array.`);
  const expectedStages={Low:0,Medium:1,High:2,Critical:2};
  if(roles.length!==expectedStages[level]||roles.some((r,i)=>r!==APPROVAL_STAGES[level][i])) fail(500,"INVALID_APPROVAL_POLICY",`Approval route for ${level} must contain ${expectedStages[level]} stage(s).`);
  const validRoles=["OperationsReviewer","SeniorReviewer","ComplianceReviewer"];
  if(roles.some(role=>!validRoles.includes(role))) fail(500,"INVALID_APPROVAL_POLICY",`Approval route for ${level} contains an unsupported role.`);
  return roles.map((role,i)=>({stageNumber:i+1,requiredRole:role,status:i===0?"Pending":"Waiting"}));
}
function safePage(q={}) {
  const page=Math.max(1,Math.min(100000,Number.parseInt(q.page,10)||1));
  const pageSize=Math.max(1,Math.min(100,Number.parseInt(q.pageSize,10)||20));
  return {page,pageSize};
}
function page(items,q) {
  const {page,pageSize}=safePage(q);
  return {data:items.slice((page-1)*pageSize,page*pageSize),pagination:{page,pageSize,total:items.length,totalPages:Math.ceil(items.length/pageSize)}};
}
function dateFilter(value, field, end=false) {
  if(value===undefined||value==="") return undefined;
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400,"INVALID_DATE",`${field} must use YYYY-MM-DD.`);
  const d=new Date(`${value}T${end?"23:59:59.999":"00:00:00.000"}Z`);
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value) fail(400,"INVALID_DATE",`${field} must be a valid calendar date.`);
  return d.toISOString();
}
function validateTransfer(body) {
  body=body??{};
  const allowed=["sourceAccountId","destinationAccountId","amountMinor","currency","description","idempotencyKey"];
  for(const k of Object.keys(body??{})) if(!allowed.includes(k)) fail(400,"INVALID_FIELD",`${k} is not supported.`);
  if(typeof body.sourceAccountId!=="string"||typeof body.destinationAccountId!=="string"||body.sourceAccountId===body.destinationAccountId) fail(400,"INVALID_TRANSFER","Distinct source and destination accounts are required.");
  if(!Number.isSafeInteger(body.amountMinor)||body.amountMinor<=0) fail(400,"INVALID_TRANSFER","amountMinor must be a positive integer in minor units.");
  if(!["CAD","USD"].includes(body.currency)) fail(400,"INVALID_TRANSFER","Currency must be CAD or USD.");
  if(typeof body.description!=="string"||body.description.length>500) fail(400,"INVALID_TRANSFER","Description must be at most 500 characters.");
  if(typeof body.idempotencyKey!=="string"||body.idempotencyKey.trim().length<1||body.idempotencyKey.length>128) fail(400,"INVALID_TRANSFER","An idempotencyKey of 8–120 characters is required.");
}
async function getClient(clients, account, session) { return account ? clients.findOne({clientId:account.clientId},{session}) : null; }

export function createRiskApprovalService(database) {
  const repositories=createRiskRepositories(database);
  const db=repositories.db;
  const {transactions:txs,accounts,clients,riskPolicies:policies,riskAssessments:assessments,approvalPolicies,approvalWorkflows:workflows,approvalDecisions:decisions,workflowActors:actors}=repositories;

  async function activeRiskPolicy(currency, session) {
    const policy=await policies.findOne({status:"Active",currencies:currency,effectiveFrom:{$lte:iso()},$or:[{effectiveTo:null},{effectiveTo:{$gt:iso()}}]},{session});
    if(!policy) fail(503,"RISK_POLICY_UNAVAILABLE",`No active risk policy is configured for ${currency}.`);
    return policy;
  }
  async function evaluateRisk(transaction, source, destination, sourceClient, destinationClient, policy, session) {
    const since=new Date(Date.now()-24*60*60*1000).toISOString();
    const history=await txs.find({sourceAccountId:source.accountId,currency:transaction.currency,status:"Completed",$or:[{processedAt:{$gte:since}},{processedAt:{$exists:false},createdAt:{$gte:since}}]},{session}).toArray();
    const count=history.length, volume=history.reduce((n,t)=>n+t.amountMinor,0);
    const input={
      amountMinor:transaction.amountMinor,currency:transaction.currency,
      sourceAccountStatus:source.status,destinationAccountStatus:destination.status,
      sourceBalanceMinor:source.balanceMinor,completedOutgoingCount24h:count,
      completedOutgoingVolumeMinor24h:volume,sourceClientStatus:sourceClient?.status??"Unknown",
      destinationClientStatus:destinationClient?.status??"Unknown",
    };
    const scored=evaluateRiskPolicy({transaction,input,policy});
    return {assessmentId:randomUUID(),transactionId:transaction.transactionId,policyId:policy.policyId,policyVersion:policy.version,riskScore:scored.riskScore,riskLevel:scored.riskLevel,approvalRequired:scored.approvalRequired,triggeredRules:scored.triggeredRules,evaluatedInputs:input,rawScore:scored.rawScore,scoreCapped:scored.scoreCapped,assessedAt:iso(),createdAt:iso()};
  }

  async function initializeIndexes() {

    await policies.createIndex({policyId:1,version:1},{unique:true});
    await policies.createIndex({status:1,currencies:1,effectiveFrom:1});
    await policies.createIndex({policyKey:1},{unique:true});
    await assessments.createIndex({assessmentId:1},{unique:true});
    await assessments.createIndex({transactionId:1},{unique:true});
    await assessments.createIndex({assessedAt:-1});
    await approvalPolicies.createIndex({policyId:1,version:1},{unique:true});
    await workflows.createIndex({workflowId:1},{unique:true});
    await workflows.createIndex({transactionId:1,status:1});
    await workflows.createIndex({status:1,currentStage:1});
    await workflows.createIndex({transactionId:1},{unique:true});
    await decisions.createIndex({decisionId:1},{unique:true});
    await decisions.createIndex({workflowId:1,stageNumber:1});
    await decisions.createIndex({workflowId:1,idempotencyKey:1},{unique:true});
    await actors.createIndex({actorId:1},{unique:true});
    await actors.createIndex({role:1});
  }
  async function seedDefaults() {
    await db.collection("risk_policy_locks").updateOne({_id:"activation"},{$setOnInsert:{version:0}},{upsert:true});
    await policies.updateOne({policyId:DEFAULT_POLICY.policyId,version:1},{$setOnInsert:DEFAULT_POLICY},{upsert:true});
    await approvalPolicies.updateOne({policyId:DEFAULT_APPROVAL_POLICY.policyId,version:1},{$setOnInsert:DEFAULT_APPROVAL_POLICY},{upsert:true});
    for(const actor of ACTORS) await actors.updateOne({actorId:actor.actorId},{$setOnInsert:actor},{upsert:true});
  }
  async function listPolicies(q={}) { const rows=await policies.find(q.status?{status:q.status}:{}).sort({policyId:1,version:-1}).toArray(); return page(rows,q); }
  async function getPolicy(id) { const p=await policies.findOne({policyKey:id})??await policies.find({policyId:id}).sort({version:-1}).limit(1).next(); if(!p) fail(404,"NOT_FOUND","Risk policy not found."); return p; }
  async function createPolicy(body, actorId) {
    await admin(actorId);
    if(body.policyId!==undefined&&(typeof body.policyId!=="string"||!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(body.policyId))) fail(400,"INVALID_POLICY","Invalid policy ID.");
    const base=await policies.find({policyId:body.policyId??"RISK-POLICY-CUSTOM"}).sort({version:-1}).limit(1).next();
    const version=(base?.version??0)+1, policyId=body.policyId??"RISK-POLICY-CUSTOM";
    const rules=body.rules??RISK_RULES, thresholds=body.thresholds??DEFAULT_THRESHOLDS;
    validateRules(rules); validateThresholds(thresholds);
    const name=typeof body.name==="string"&&body.name.trim()?body.name.trim():`Risk Policy ${version}`;
    if(typeof policyId!=="string"||!/^[A-Z0-9][A-Z0-9_-]{2,79}$/.test(policyId)) fail(400,"INVALID_POLICY","Policy ID must use 3–80 uppercase letters, digits, hyphens or underscores.");
    const p={policyKey:randomUUID(),policyId,version,name,description:typeof body.description==="string"?body.description:"",currencies:body.currencies??["CAD","USD"],status:"Draft",effectiveFrom:null,effectiveTo:null,rules,thresholds,createdAt:iso(),updatedAt:iso(),createdBy:actorId};
    if(!Array.isArray(p.currencies)||!p.currencies.length||new Set(p.currencies).size!==p.currencies.length||p.currencies.some(x=>!["CAD","USD"].includes(x))) fail(400,"INVALID_POLICY","Currencies must contain CAD and/or USD.");
    await policies.insertOne(p); return p;
  }
  async function updatePolicy(id, body, actorId) {
    await admin(actorId);
    const allowed=["actorId","name","description","currencies","rules","thresholds"];
    for(const key of Object.keys(body??{})) if(!allowed.includes(key)) fail(400,"INVALID_POLICY",`Unsupported policy field: ${key}.`);
    const p=await getPolicy(id); if(p.status!=="Draft") fail(409,"POLICY_IMMUTABLE","Only draft policy versions can be edited.");
    const rules=body.rules??p.rules, thresholds=body.thresholds??p.thresholds;
    validateRules(rules); validateThresholds(thresholds);
    const currencies=body.currencies??p.currencies;
    if(!Array.isArray(currencies)||!currencies.length||new Set(currencies).size!==currencies.length||currencies.some(x=>!["CAD","USD"].includes(x))) fail(400,"INVALID_POLICY","Currencies must contain CAD and/or USD.");
    const patch={...body,currencies,rules,thresholds,updatedAt:iso(),updatedBy:actorId};
    delete patch._id; delete patch.policyId; delete patch.version; delete patch.status; delete patch.actorId;
    const updated=await policies.updateOne({_id:p._id,status:"Draft"},{$set:patch}); if(!updated.matchedCount) fail(409,"POLICY_IMMUTABLE","Policy is no longer a draft.");
    return policies.findOne({_id:p._id});
  }
  async function activatePolicy(id, actorId) {
    await admin(actorId);
    const p=await getPolicy(id); if(p.status!=="Draft") fail(409,"POLICY_IMMUTABLE","Only draft policy versions can be activated.");
    validateRules(p.rules); validateThresholds(p.thresholds);
    const session=db.client.startSession();
    try { await session.withTransaction(async()=>{
      await db.collection("risk_policy_locks").updateOne({_id:"activation"},{$inc:{version:1}},{session});
      const fresh=await policies.findOne({_id:p._id,status:"Draft",updatedAt:p.updatedAt},{session}); if(!fresh) fail(409,"POLICY_CONFLICT","Draft changed; reload and retry.");
      const supersededAt=iso();
      const displaced=await policies.find({status:"Active",currencies:{$in:p.currencies},_id:{$ne:p._id}},{session}).toArray();
      for(const previous of displaced) {
        const remaining=previous.currencies.filter(currency=>!p.currencies.includes(currency));
        await policies.updateOne({_id:previous._id,status:"Active"},{$set:{status:"Superseded",effectiveTo:supersededAt,updatedAt:supersededAt}},{session});
        if(remaining.length) {
          const latest=await policies.find({policyId:previous.policyId},{session}).sort({version:-1}).limit(1).next();
          const retained={...previous,_id:undefined,policyKey:randomUUID(),version:(latest?.version??previous.version)+1,currencies:remaining,status:"Active",effectiveFrom:supersededAt,effectiveTo:null,createdAt:supersededAt,updatedAt:supersededAt,createdBy:"SYSTEM",supersedesVersion:previous.version};
          delete retained._id;
          await policies.insertOne(retained,{session});
        }
      }
      await policies.updateOne({_id:p._id,status:"Draft"},{$set:{status:"Active",effectiveFrom:iso(),effectiveTo:null,updatedAt:iso(),activatedBy:actorId}},{session});
    }); } finally { await session.endSession(); }
    return policies.findOne({_id:p._id});
  }
  async function actor(actorId,requiredRole) { const u=await db.collection('users').findOne({_id:actorId,status:'Active'}); const map={'System Administrator':'PolicyAdministrator','Operations Reviewer':'OperationsReviewer','Senior Reviewer':'SeniorReviewer','Compliance Reviewer':'ComplianceReviewer'};const authorized=u?.roles.map(r=>map[r]).filter(Boolean)||[];const role=requiredRole?authorized.find(r=>r===requiredRole):authorized[0];const a=role?{actorId,name:u.firstName+' '+u.lastName,role}:null; if(!a) fail(403,"INVALID_ACTOR","An active authenticated user with the required workflow role is required."); return a; }
  async function admin(actorId) { const a=await actor(actorId,"PolicyAdministrator"); if(a.role!=="PolicyAdministrator") fail(403,"FORBIDDEN","Policy Administrator role is required."); return a; }

  async function initiateTransfer(body) {
    validateTransfer(body);
    const existing=await txs.findOne({idempotencyKey:body.idempotencyKey});
    if(existing){
      const same=existing.sourceAccountId===body.sourceAccountId&&existing.destinationAccountId===body.destinationAccountId&&existing.amountMinor===body.amountMinor&&existing.currency===body.currency&&existing.description===body.description.trim();
      if(!same) fail(409,"IDEMPOTENCY_CONFLICT","The transfer idempotency key was already used with different transaction details.");
      return {record:existing,replayed:true};
    }
    const session=db.client.startSession(); let result, replayed=false;
    try { await session.withTransaction(async()=>{
      const source=await accounts.findOne({accountId:body.sourceAccountId},{session});
      const destination=await accounts.findOne({accountId:body.destinationAccountId},{session});
      if(!source||!destination) fail(404,"ACCOUNT_NOT_FOUND","Source or destination account not found.");
      const sc=await getClient(clients,source,session);
      const dc=await getClient(clients,destination,session);
      if(!sc||!dc) fail(409,"CLIENT_CONTEXT_MISSING","Both account owners must exist.");
      const stamp=iso(), transaction={transactionId:randomUUID(),referenceNumber:`TXN-${Date.now()}-${randomUUID().slice(0,8).toUpperCase()}`,sourceAccountId:source.accountId,destinationAccountId:destination.accountId,amountMinor:body.amountMinor,currency:body.currency,transactionType:"Transfer",description:body.description.trim(),status:"Pending",createdAt:stamp,updatedAt:stamp,processedAt:null,rejectionReason:null,idempotencyKey:body.idempotencyKey,origin:"Assignment3"};
      const policy=await activeRiskPolicy(body.currency,session);
      const assessment=await evaluateRisk(transaction,source,destination,sc,dc,policy,session);
      const ap=await approvalPolicies.findOne({status:"Active"},{session});
      if(!ap) fail(503,"APPROVAL_POLICY_UNAVAILABLE","No active approval policy is configured.");
      const stages=stageList(assessment.riskLevel,ap.routes);
      const workflow=stages.length?{workflowId:randomUUID(),transactionId:transaction.transactionId,assessmentId:assessment.assessmentId,approvalPolicyId:ap.policyId,approvalPolicyVersion:ap.version,status:"Pending",currentStage:1,requiredStages:stages,createdAt:stamp,updatedAt:stamp,escalations:[]}:null;
      Object.assign(transaction,{riskAssessmentId:assessment.assessmentId,riskScore:assessment.riskScore,riskLevel:assessment.riskLevel,approvalRequired:assessment.approvalRequired,approvalWorkflowId:workflow?.workflowId??null,approvalStatus:workflow?"Pending":"NotRequired"});
      await assessments.insertOne(assessment,{session});
      if(workflow) await workflows.insertOne(workflow,{session});
      await txs.insertOne(transaction,{session});
      result=transaction;
    }); } catch(error) {
      if(error.code===11000) {
        const duplicate=await txs.findOne({idempotencyKey:body.idempotencyKey});
        if(duplicate) {
          const same=duplicate.sourceAccountId===body.sourceAccountId&&duplicate.destinationAccountId===body.destinationAccountId&&duplicate.amountMinor===body.amountMinor&&duplicate.currency===body.currency&&duplicate.description===body.description.trim();
          if(same) {result=duplicate;replayed=true;}
          else fail(409,"IDEMPOTENCY_CONFLICT","The transfer idempotency key was already used with different transaction details.");
        } else throw error;
      } else throw error;
    } finally { await session.endSession(); }
    return {record:result,replayed};
  }

  async function requireApproval(t, session) {
      const id=t.transactionId;
      if(!t.riskAssessmentId||!t.approvalStatus) fail(409,"RISK_ASSESSMENT_REQUIRED","Historical transactions without an Assignment 3 assessment are protected from execution.");
      const assessment=await assessments.findOne({assessmentId:t.riskAssessmentId,transactionId:id},{session});
      if(!assessment||assessment.riskScore!==t.riskScore||assessment.riskLevel!==t.riskLevel||assessment.approvalRequired!==t.approvalRequired) fail(409,"RISK_ASSESSMENT_INVALID","The transaction does not match its authoritative risk assessment.");
      if(assessment.approvalRequired) {
        if(t.approvalStatus!=="Approved"||!t.approvalWorkflowId) fail(409,"APPROVAL_REQUIRED","The transaction requires approval before processing.");
        const workflow=await workflows.findOne({workflowId:t.approvalWorkflowId,transactionId:id,status:"Approved"},{session});
        if(!workflow) fail(409,"APPROVAL_REQUIRED","The required approval workflow is not approved.");
      } else if(t.approvalStatus!=="NotRequired"||t.approvalWorkflowId) {
        fail(409,"APPROVAL_STATE_INVALID","The transaction approval state is inconsistent with its risk assessment.");
      }
  }

  async function submitDecision(workflowId, body) {
    const {actorId,decision,comments="",idempotencyKey}=body??{};
    if(typeof actorId!=="string"||typeof comments!=="string") fail(400,"INVALID_DECISION","actorId and comments must be strings.");
    if(!["Approved","Rejected","Escalated"].includes(decision)) fail(400,"INVALID_DECISION","Decision must be Approved, Rejected or Escalated.");
    if(typeof idempotencyKey!=="string"||idempotencyKey.length<8||idempotencyKey.length>120) fail(400,"IDEMPOTENCY_REQUIRED","An idempotencyKey of 8–120 characters is required.");
    if(comments.length>1000) fail(400,"INVALID_DECISION","Comments must not exceed 1000 characters.");
    if(decision==="Rejected"&&(!comments||!comments.trim())) fail(400,"REJECTION_REASON_REQUIRED","Rejection must include a reason.");
    if(decision==="Escalated"&&(!comments||!comments.trim())) fail(400,"ESCALATION_REASON_REQUIRED","Escalation must include a reason.");
    const workflowSnapshot=await workflows.findOne({workflowId});const historical=await decisions.findOne({workflowId,idempotencyKey,actorId});const a=await actor(actorId,historical?.actorRole??workflowSnapshot?.requiredStages.find(s=>s.stageNumber===workflowSnapshot.currentStage)?.requiredRole);
    const session=db.client.startSession(); let output;
    try { await session.withTransaction(async()=>{
      const duplicate=await decisions.findOne({workflowId,idempotencyKey},{session});
      if(duplicate){
        if(duplicate.actorId!==actorId||duplicate.decision!==decision||duplicate.comments!==comments.slice(0,1000)||(decision==="Escalated"&&duplicate.destinationRole!==(body.destinationRole??(a.role==="OperationsReviewer"?"SeniorReviewer":"ComplianceReviewer")))) fail(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for a different decision.");
        output=duplicate;return;
      }
      const w=await workflows.findOne({workflowId},{session});
      if(!w) fail(404,"NOT_FOUND","Approval workflow not found.");
      if(!["Pending","InReview","Escalated"].includes(w.status)) fail(409,"WORKFLOW_CLOSED","Workflow no longer accepts decisions.");
      const stage=w.requiredStages.find(s=>s.stageNumber===w.currentStage);
      if(!stage||!["Pending","InReview"].includes(stage.status)) fail(409,"INVALID_STAGE","There is no actionable stage.");
      if(stage.requiredRole!==a.role) fail(403,"ROLE_MISMATCH",`Current stage requires ${stage.requiredRole}.`);
      const prior=await decisions.findOne({workflowId,actorId,decision:{$in:["Approved","Rejected"]}},{session});
      if(prior) fail(409,"ACTOR_ALREADY_REVIEWED","A reviewer may decide only once per workflow.");
      if(decision==="Escalated") {
        const allowedEscalations={OperationsReviewer:["SeniorReviewer"],SeniorReviewer:["ComplianceReviewer"],ComplianceReviewer:[]};
        const destination=body.destinationRole??(a.role==="OperationsReviewer"?"SeniorReviewer":"ComplianceReviewer");
        if(!allowedEscalations[a.role]?.includes(destination)) fail(400,"INVALID_ESCALATION","Escalation must move to the next higher review role.");
        const record={decisionId:randomUUID(),workflowId,transactionId:w.transactionId,stageNumber:w.currentStage,actorId,actorRole:a.role,decision:"Escalated",comments:String(comments).slice(0,1000),destinationRole:destination,decidedAt:iso(),idempotencyKey};
        await decisions.insertOne(record,{session});
        const escalatedStages=w.requiredStages.map(s=>s.stageNumber===w.currentStage?{...s,status:"Pending"}:s);
        const workflowUpdate=await workflows.updateOne({workflowId,currentStage:w.currentStage,status:w.status},{$set:{status:"Escalated",requiredStages:escalatedStages,updatedAt:iso(),escalatedTo:destination},$push:{escalations:{actorId,reason:comments,destinationRole:destination,createdAt:record.decidedAt}}},{session});
        if(workflowUpdate.matchedCount!==1) fail(409,"WORKFLOW_CONFLICT","Another request changed this workflow before escalation.");
        const txUpdate=await txs.updateOne({transactionId:w.transactionId},{$set:{approvalStatus:"Escalated",updatedAt:iso()}},{session});
        if(txUpdate.matchedCount!==1) fail(409,"TRANSACTION_CONFLICT","The linked transaction could not be updated with the escalation.");
        output=record; return;
      }
      const record={decisionId:randomUUID(),workflowId,transactionId:w.transactionId,stageNumber:w.currentStage,actorId,actorRole:a.role,decision,comments:String(comments).slice(0,1000),decidedAt:iso(),idempotencyKey};
      await decisions.insertOne(record,{session});
      const stages=w.requiredStages.map(s=>s.stageNumber===w.currentStage?{...s,status:decision}:s);
      let status, next=w.currentStage;
      if(decision==="Rejected") status="Rejected";
      else if(w.currentStage===stages.length) status="Approved";
      else {status="InReview";next=w.currentStage+1;stages.find(s=>s.stageNumber===next).status="Pending";}
      const updated=await workflows.updateOne({workflowId,currentStage:w.currentStage,status:w.status},{$set:{requiredStages:stages,status,currentStage:next,updatedAt:iso()}},{session});
      if(updated.matchedCount!==1) fail(409,"WORKFLOW_CONFLICT","Another decision changed this workflow. Refresh and retry.");
      const txUpdate=await txs.updateOne({transactionId:w.transactionId,status:"Pending"},{$set:{approvalStatus:status,updatedAt:iso(),...(status==="Rejected"?{status:"Rejected",processedAt:iso(),rejectionReason:comments}: {})}},{session});
      if(txUpdate.matchedCount!==1) fail(409,"TRANSACTION_CONFLICT","The linked transaction could not be updated with the approval decision.");
      output=record;
    }); } catch(error) {
      if(error.code===11000) {
        const duplicate=await decisions.findOne({workflowId,idempotencyKey});
        if(duplicate&&duplicate.actorId===actorId&&duplicate.decision===decision&&duplicate.comments===comments.slice(0,1000)&&(decision!=="Escalated"||duplicate.destinationRole===(body.destinationRole??(a.role==="OperationsReviewer"?"SeniorReviewer":"ComplianceReviewer")))) output=duplicate;
        else if(duplicate) fail(409,"IDEMPOTENCY_CONFLICT","The idempotency key was already used for a different decision.");
        else throw error;
      } else throw error;
    } finally {await session.endSession();}
    return output;
  }

  async function escalate(workflowId,body) {
    return submitDecision(workflowId,{...body,decision:"Escalated"});
  }
  async function getWorkflow(id) {
    const w=await workflows.findOne({$or:[{workflowId:id},{transactionId:id}]});
    if(!w) fail(404,"NOT_FOUND","Approval workflow not found.");
    const history=await decisions.find({workflowId:w.workflowId}).sort({decidedAt:1}).toArray();
    return {...w,decisions:history,transaction:await txs.findOne({transactionId:w.transactionId})};
  }
  async function listWorkflows(q={}) {
    const filter={}; if(q.queue==="true") filter.status=q.status??{$in:["Pending","InReview","Escalated"]}; else if(q.status) filter.status=q.status; if(q.riskLevel) {const t=await txs.find({riskLevel:q.riskLevel}).project({transactionId:1}).toArray();filter.transactionId={$in:t.map(x=>x.transactionId)};}
    let rows=await workflows.find(filter).sort({updatedAt:-1}).toArray();
    const enriched=await Promise.all(rows.map(async w=>({...w,transaction:await txs.findOne({transactionId:w.transactionId},{projection:{referenceNumber:1,amountMinor:1,currency:1,riskLevel:1,riskScore:1,status:1,approvalStatus:1}})})));
    let filtered=enriched;
    if(q.role) filtered=filtered.filter(w=>w.requiredStages.find(s=>s.stageNumber===w.currentStage)?.requiredRole===q.role);
    if(q.search) filtered=filtered.filter(w=>(w.transaction?.referenceNumber??"").toLowerCase().includes(String(q.search).toLowerCase()));
    if(q.minAmount!==undefined) filtered=filtered.filter(w=>(w.transaction?.amountMinor??0)>=Number(q.minAmount));
    if(q.maxAmount!==undefined) filtered=filtered.filter(w=>(w.transaction?.amountMinor??0)<=Number(q.maxAmount));
    const from=dateFilter(q.from,"from"),to=dateFilter(q.to,"to",true);
    if(from&&to&&from>to) fail(400,"INVALID_DATE_RANGE","from must not follow to.");
    for(const key of ["minAmount","maxAmount"]) if(q[key]!==undefined&&(!Number.isSafeInteger(Number(q[key]))||Number(q[key])<0)) fail(400,"INVALID_AMOUNT",`${key} must be a non-negative integer in minor units.`);
    if(q.minAmount!==undefined&&q.maxAmount!==undefined&&Number(q.minAmount)>Number(q.maxAmount)) fail(400,"INVALID_AMOUNT_RANGE","minAmount must not exceed maxAmount.");
    if(from) filtered=filtered.filter(w=>w.createdAt>=from);
    if(to) filtered=filtered.filter(w=>w.createdAt<=to);
    const direction=q.order==="asc"?1:-1;
    const sorters={
      createdAt:(a,b)=>a.createdAt.localeCompare(b.createdAt),
      updatedAt:(a,b)=>a.updatedAt.localeCompare(b.updatedAt),
      amount:(a,b)=>(a.transaction?.amountMinor??0)-(b.transaction?.amountMinor??0),
      riskScore:(a,b)=>(a.transaction?.riskScore??0)-(b.transaction?.riskScore??0),
    };
    filtered.sort(sorters[q.sort]??sorters.updatedAt);
    if(direction===-1) filtered.reverse();
    return page(filtered,q);
  }
  async function listAssessments(q={}) {
    const filter={}; if(q.riskLevel) filter.riskLevel=q.riskLevel; if(q.transactionId) filter.transactionId=q.transactionId;
    if(q.minScore!==undefined||q.maxScore!==undefined) filter.riskScore={...(q.minScore!==undefined?{$gte:Number(q.minScore)}:{}),...(q.maxScore!==undefined?{$lte:Number(q.maxScore)}:{})};
    const from=dateFilter(q.from,"from"),to=dateFilter(q.to,"to",true);
    if(from&&to&&from>to) fail(400,"INVALID_DATE_RANGE","from must not follow to.");
    if(from||to) filter.assessedAt={...(from?{$gte:from}:{}),...(to?{$lte:to}:{})};
    for(const key of ["minScore","maxScore"]) if(q[key]!==undefined&&(!Number.isInteger(Number(q[key]))||Number(q[key])<0||Number(q[key])>100)) fail(400,"INVALID_SCORE",`${key} must be an integer from 0 to 100.`);
    if(q.minScore!==undefined&&q.maxScore!==undefined&&Number(q.minScore)>Number(q.maxScore)) fail(400,"INVALID_SCORE_RANGE","minScore must not exceed maxScore.");
    const sort=q.sort==="riskScore"?{riskScore:-1,assessedAt:-1}:{assessedAt:-1};
    let rows=await assessments.find(filter).sort(sort).toArray();
    if(q.search){const tx=await txs.find({referenceNumber:{$regex:String(q.search).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),$options:"i"}}).project({transactionId:1}).toArray();const ids=new Set(tx.map(x=>x.transactionId));rows=rows.filter(x=>ids.has(x.transactionId));}
    return page(rows,q);
  }
  async function getAssessment(id) {
    const a=await assessments.findOne({$or:[{assessmentId:id},{transactionId:id}]});
    if(!a) fail(404,"NOT_FOUND","Risk assessment not found."); return a;
  }
  async function dashboard() {
    const [risk,workflow,transactionCount]=await Promise.all([
      assessments.find({}).toArray(),workflows.find({}).toArray(),txs.countDocuments({})
    ]);
    const byLevel=Object.fromEntries(["Low","Medium","High","Critical"].map(x=>[x,risk.filter(r=>r.riskLevel===x).length]));
    return {totalAssessments:risk.length,byRiskLevel:byLevel,highAndCritical:byLevel.High+byLevel.Critical,pendingApprovals:workflow.filter(w=>["Pending","InReview","Escalated"].includes(w.status)).length,rejectedWorkflows:workflow.filter(w=>w.status==="Rejected").length,approvedWorkflows:workflow.filter(w=>w.status==="Approved").length,totalTransactions:transactionCount,recentAssessments:risk.filter(a=>["High","Critical"].includes(a.riskLevel)).sort((a,b)=>b.assessedAt.localeCompare(a.assessedAt)).slice(0,8)};
  }
  async function approvalDashboard(){
    const rows=await workflows.find({}).toArray(), history=await decisions.find({}).sort({decidedAt:-1}).limit(10).toArray();
    const counts=Object.fromEntries(["Pending","InReview","Approved","Rejected","Escalated","Cancelled"].map(s=>[s,rows.filter(w=>w.status===s).length]));
    const completed=rows.filter(w=>w.status==="Approved"&&w.updatedAt&&w.createdAt).map(w=>Date.parse(w.updatedAt)-Date.parse(w.createdAt));
    const pendingIds=rows.filter(w=>["Pending","InReview","Escalated"].includes(w.status)).map(w=>w.transactionId);
    const highRiskPending=await txs.countDocuments({transactionId:{$in:pendingIds},riskLevel:{$in:["High","Critical"]}});
    return {...counts,totalWorkflows:rows.length,highRiskPending,averageCompletionMs:completed.length?Math.round(completed.reduce((a,b)=>a+b,0)/completed.length):0,recentDecisions:history};
  }
  async function listActors(){return (await actors.find({active:true}).sort({name:1}).toArray()).map(({actorId,name,role})=>({actorId,name,role}));}
  async function decisionsFor(id){return decisions.find({$or:[{workflowId:id},{transactionId:id}]}).sort({decidedAt:1}).toArray();}
  return {initializeIndexes,seedDefaults,listPolicies,getPolicy,createPolicy,updatePolicy,activatePolicy,initiateTransfer,requireApproval,submitDecision,escalate,getWorkflow,listWorkflows,listAssessments,getAssessment,dashboard,approvalDashboard,listActors,decisionsFor,admin};
}
export const defaultRiskConfiguration = { rules:RISK_RULES, thresholds:DEFAULT_THRESHOLDS, approvalStages:APPROVAL_STAGES, actors:ACTORS };
