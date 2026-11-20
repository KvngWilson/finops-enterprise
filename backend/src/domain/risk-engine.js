export function evaluateRiskPolicy({ transaction, input, policy }) {
  const triggeredRules=[];
  for(const rule of policy.rules) {
    let triggered=false,evaluatedValue=null,condition="";
    switch(rule.ruleId) {
      case "RISK-001": case "RISK-002": case "RISK-003": {
        const threshold=rule.thresholdMinor??Math.round(Number(rule.thresholdMajor)*100);
        evaluatedValue=transaction.amountMinor;condition=`amountMinor >= ${threshold}`;triggered=evaluatedValue>=threshold;break;
      }
      case "RISK-004": evaluatedValue=input.completedOutgoingCount24h;condition=`completedOutgoingCount24h >= ${rule.threshold??5}`;triggered=evaluatedValue>=(rule.threshold??5);break;
      case "RISK-005": {
        const threshold=rule.thresholdMinor??Math.round(Number(rule.thresholdMajor??100000)*100);
        evaluatedValue=input.completedOutgoingVolumeMinor24h;condition=`completedOutgoingVolumeMinor24h >= ${threshold}`;triggered=evaluatedValue>=threshold;break;
      }
      case "RISK-006": evaluatedValue=input.sourceBalanceMinor?transaction.amountMinor/input.sourceBalanceMinor:1;condition=`amountMinor / sourceBalanceMinor > ${rule.threshold??0.5}`;triggered=input.sourceBalanceMinor===0||evaluatedValue>(rule.threshold??0.5);break;
      case "RISK-007": evaluatedValue=input.sourceClientStatus;condition="sourceClientStatus != Active";triggered=evaluatedValue!=="Active";break;
      case "RISK-008": evaluatedValue=input.destinationClientStatus;condition="destinationClientStatus != Active";triggered=evaluatedValue!=="Active";break;
    }
    if(triggered) triggeredRules.push({ruleId:rule.ruleId,points:rule.points,reason:rule.description,evaluatedValue,condition});
  }
  const rawScore=triggeredRules.reduce((sum,rule)=>sum+rule.points,0);
  const riskScore=Math.min(100,rawScore);
  const band=policy.thresholds.find(t=>riskScore>=t.min&&riskScore<=t.max);
  if(!band) throw new Error("Risk policy thresholds do not classify the calculated score.");
  return {riskScore,riskLevel:band.level,approvalRequired:band.approvalRequired,triggeredRules,rawScore,scoreCapped:rawScore>100};
}
