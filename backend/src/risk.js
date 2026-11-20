import {db} from "./db.js";
import {createRiskApprovalService} from "./services/risk-approval.js";
export const risk=createRiskApprovalService(db);
export async function upgradeRisk(){await risk.initializeIndexes();await risk.seedDefaults();await db.collection("transactions").updateMany({riskAssessmentId:{$exists:false}},{$set:{riskAssessmentId:null,riskScore:null,riskLevel:null,approvalRequired:false,approvalWorkflowId:null,approvalStatus:"LegacyProtected"}});await db.collection("migrations").updateOne({_id:"assignment-3-risk"},{$setOnInsert:{completedAt:new Date()}},{upsert:true});}
