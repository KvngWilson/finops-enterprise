// Collection boundary for risk, approval and financial transaction services.
// The MongoDB session is coordinated by the service layer so multi-document
// business operations can commit or roll back as one unit.
export function createRiskRepositories(db) {
  return {
    db,
    clients:db.collection("clients"),
    accounts:db.collection("accounts"),
    transactions:db.collection("transactions"),
    riskPolicies:db.collection("risk_policies"),
    riskAssessments:db.collection("risk_assessments"),
    approvalPolicies:db.collection("approval_policies"),
    approvalWorkflows:db.collection("approval_workflows"),
    approvalDecisions:db.collection("approval_decisions"),
    workflowActors:db.collection("workflow_actors"),
  };
}
