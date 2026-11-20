import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRiskPolicy } from "../src/domain/risk-engine.js";
import { defaultRiskConfiguration } from "../src/services/risk-approval.js";
const baseInput={amountMinor:100000,sourceBalanceMinor:1000000,completedOutgoingCount24h:0,completedOutgoingVolumeMinor24h:0,sourceClientStatus:"Active",destinationClientStatus:"Active"};
const transaction={amountMinor:100000,currency:"CAD"};
const policy={rules:defaultRiskConfiguration.rules,thresholds:defaultRiskConfiguration.thresholds};
test("risk evaluation is deterministic for identical inputs and policy",()=>{
 const args={transaction,input:baseInput,policy};
 assert.deepEqual(evaluateRiskPolicy(args),evaluateRiskPolicy(args));
});
test("amount rules are cumulative and use minor units",()=>{
 const result=evaluateRiskPolicy({transaction:{amountMinor:12_000_000,currency:"CAD"},input:{...baseInput,sourceBalanceMinor:100_000_000},policy});
 assert.deepEqual(result.triggeredRules.map(r=>r.ruleId),["RISK-001","RISK-002","RISK-003"]);
 assert.equal(result.riskScore,60);assert.equal(result.riskLevel,"High");
});
test("risk score is capped at 100 and retains raw score",()=>{
 const input={...baseInput,completedOutgoingCount24h:5,completedOutgoingVolumeMinor24h:10_000_000,sourceClientStatus:"Suspended",destinationClientStatus:"Inactive",sourceBalanceMinor:1000};
 const result=evaluateRiskPolicy({transaction:{amountMinor:12_000_000,currency:"USD"},input,policy});
 assert.equal(result.riskScore,100);assert.equal(result.rawScore,170);assert.equal(result.scoreCapped,true);assert.equal(result.riskLevel,"Critical");
});
test("risk band boundaries have no gaps",()=>{
 const points=[0,24,25,49,50,74,75,100];
 const expected=["Low","Low","Medium","Medium","High","High","Critical","Critical"];
 for(let i=0;i<points.length;i++){
  const p={rules:[{ruleId:"RISK-004",points:points[i],threshold:0,description:"test"}],thresholds:policy.thresholds};
  const r=evaluateRiskPolicy({transaction,input:{...baseInput,completedOutgoingCount24h:1},policy:p});
  assert.equal(r.riskLevel,expected[i]);
 }
});

test("activity, balance and non-active client rules record evaluated evidence",()=>{
 const input={...baseInput,completedOutgoingCount24h:5,completedOutgoingVolumeMinor24h:10_000_000,sourceBalanceMinor:100_000,sourceClientStatus:"Suspended",destinationClientStatus:"Inactive"};
 const result=evaluateRiskPolicy({transaction:{amountMinor:60_000,currency:"CAD"},input,policy});
 assert.deepEqual(result.triggeredRules.map(r=>r.ruleId),["RISK-004","RISK-005","RISK-006","RISK-007","RISK-008"]);
 assert.equal(result.triggeredRules[0].evaluatedValue,5);
 assert.equal(result.triggeredRules[3].evaluatedValue,"Suspended");
});
