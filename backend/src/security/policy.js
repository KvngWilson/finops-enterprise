// Reserved system roles correspond to the Assignment 4 authorization matrix.
const staffRead=['clients.read','accounts.read','transactions.read','risk.assessments.read','risk.policies.read','approvals.read'];
const admin=['users.read','users.create','users.update','users.status','users.roles','roles.read','roles.create','roles.update','permissions.read','permissions.assign','dashboard.read','clients.create','clients.update','accounts.create','risk.policies.create','risk.policies.update','risk.policies.activate','risk.cases.assign','audit.read'];
export const rolePermissions={
 'System Administrator':[...staffRead,...admin],
 Manager:[...staffRead,'dashboard.read','transactions.process','audit.read'],
 'Operations Reviewer':[...staffRead,'approvals.medium.decide','approvals.high.stage1','approvals.escalate'],
 'Senior Reviewer':[...staffRead,'approvals.high.stage2','approvals.critical.stage1','approvals.escalate'],
 'Compliance Reviewer':[...staffRead,'approvals.critical.stage2','audit.read'],
 'Risk Analyst':[...staffRead,'risk.cases.manage','audit.read'],
 Auditor:[...staffRead,'audit.read'],
 Customer:['accounts.own.read','transactions.own.read','transactions.own.create']};
export const reviewerRoles={'Operations Reviewer':'OperationsReviewer','Senior Reviewer':'SeniorReviewer','Compliance Reviewer':'ComplianceReviewer'};
export const stagePermission=(level,stage)=>({Medium:{1:'approvals.medium.decide'},High:{1:'approvals.high.stage1',2:'approvals.high.stage2'},Critical:{1:'approvals.critical.stage1',2:'approvals.critical.stage2'}}[level]?.[stage]);
export const allowedStage=(roles,level,stage)=>!!stagePermission(level,stage)&&roles.some(r=>rolePermissions[r]?.includes(stagePermission(level,stage)));
export const allPermissions=[...new Set(Object.values(rolePermissions).flat())];
// Only non-administrative, non-approval permissions are editable in custom roles.
export const editablePermission=p=>allPermissions.includes(p)&&!/^users\.|^roles\.|^permissions\.|\.own\.|^approvals\.(?!read$)|^risk\.policies\.(?!read$)|^risk\.cases\.assign$/.test(p);
