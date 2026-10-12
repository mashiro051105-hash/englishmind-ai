import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { budgetContext,onlinePermission,requestBudget,diagnosticChecks,evaluationChecks,runQuality } from '../quality/runner.js';
import { tripGoal,travelTask } from '../quality/cases.js';
import { summaryFacts,verifiedSummary } from '../server/summary.js';
import { estimateCost } from '../server/telemetry.js';
import { mockProvider } from '../server/mock.js';
import { TeachingStore } from '../server/teaching.js';
import { ProviderError, type DiagnosticResult, type Evaluation, type TeachingProvider } from '../server/provider.js';
const diagnosis=(text:string,correct=false):DiagnosticResult=>({diagnosis:{original:text,assessment:'assessed',issues:[{category:correct?'no_issue':'collocation',explanation:'go on a trip需要介词on；gain knowledge更常见，但不是绝对禁止learn knowledge。',natural:correct?text:'I went on a trip to Hangzhou last year.',chunks:correct?[]:[tripGoal.chunk,'gain knowledge']}],nextAction:correct?'finish':'practice'},target:correct?null:tripGoal});
const evaluation=(text:string,type='success'):Evaluation=>({verdict:type==='success'?'success':type==='wrong'?'failure':'partial',reason:'分开评价语言与信息',dimensions:{languageAccuracy:'correct',naturalness:'natural',taskCompletion:type==='wrong'?'incorrect':'complete',targetRetrieval:type==='visit'?'not_used':'used',evidence:[text]},diagnosis:{original:text,assessment:'assessed',issues:[{category:'no_issue',explanation:'英语正确且自然；任务及目标另行评价',natural:text,chunks:[]}],nextAction:'retry'}});
test('缺少任一授权/凭证/核验开关不启用在线；预算默认10、硬上限12及取消',()=>{
 assert.equal(onlinePermission({}).enabled,false);assert.equal(onlinePermission({RUN_LIVE_AI:'1',OPENAI_API_KEY:'test',OPENAI_MODEL:'x'}).enabled,false);assert.equal(onlinePermission({RUN_LIVE_AI:'1',PAID_TEST_AUTHORIZED:'yes',QUALITY_PREFLIGHT_CONFIRMED:'yes'}).enabled,false);assert.equal(requestBudget({}),10);assert.throws(()=>requestBudget({QUALITY_MAX_REQUESTS:'13'}));const controller=new AbortController(),b=budgetContext(2,controller.signal);b.context.consume();b.context.consume();assert.throws(()=>b.context.consume());assert.equal(b.count(),2);controller.abort();assert.throws(()=>b.context.consume());
});
test('教学质量检查不等于Schema：自然visit不报语法；正确词块但错信息分开评价',()=>{
 assert.equal(Object.values(diagnosticChecks('C',diagnosis('correct',true))).every(Boolean),true);assert.equal(diagnosticChecks('C',diagnosis('correct',false)).noIssue,false);
 assert.equal(Object.values(evaluationChecks('D',evaluation("I'm planning to visit Xi'an this summer.",'visit'))).every(Boolean),true);assert.equal(Object.values(evaluationChecks('G',evaluation("I'm going on a trip to Hangzhou next winter.",'wrong'))).every(Boolean),true);
});
test('A–H全方案以模拟Provider执行并仍待人工复核；F按真实提示事件分类，H不造迁移',async()=>{
 const p:TeachingProvider={id:'mock',diagnose:text=>diagnosis(text,text.startsWith('I really')),evaluate:text=>evaluation(text,text.includes('visit')?'visit':text.includes('Hangzhou next')?'wrong':'success'),generateTask:async input=>({...travelTask,id:randomUUID(),kind:input.kind,prompt:'你向旅行社说明计划明年春天带家人去苏州旅行，请表达这个安排。'}),summarize:async record=>({...summaryFacts(record),statement:'本轮有提示练习，尚无迁移作答。',evidenceIds:record.attempts.map(a=>a.id)})};
 const result=await runQuality(p,budgetContext(10,new AbortController().signal).context);assert.equal(result.length,8);assert.ok(result.every(r=>r.status==='needs_review'));assert.ok(result.find(r=>r.id==='F')!.checks.hintedSuccess);
});
test('费用估算包含cached token，缺失usage不能伪造零费用',()=>{
 assert.equal(estimateCost({inputTokens:1000,cachedInputTokens:500,outputTokens:200},{input:2,cachedInput:0.1,output:10}),0.00305);assert.equal(estimateCost({inputTokens:null,cachedInputTokens:null,outputTokens:null},{input:2,cachedInput:0.1,output:10}),null);
});
test('总结只能引用实际记录；提示与初练不能伪造首次迁移/长期掌握',async()=>{
 const store=new TeachingStore(mockProvider);let s=await store.start({requestId:randomUUID(),mode:'diagnosis',scenario:'campus'});s=await store.command(s.id,{requestId:randomUUID(),revision:0,type:'submit',text:'I very like English.'});const r=s.record!,facts=summaryFacts(r);assert.equal(facts.transferCount,0);const summary={...facts,statement:'仅本轮诊断，无迁移作答。',evidenceIds:[r.attempts[0].id]};assert.ok(verifiedSummary(summary,r));assert.throws(()=>verifiedSummary({...summary,independentSuccessCount:1},r));assert.throws(()=>verifiedSummary({...summary,statement:'已经掌握'},r));assert.throws(()=>verifiedSummary({...summary,evidenceIds:['fake']},r));
});
