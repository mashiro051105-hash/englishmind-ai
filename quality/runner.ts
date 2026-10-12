import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TeachingStore } from '../server/teaching.js';
import { ProviderError, type TeachingProvider, type DiagnosticResult, type Evaluation, type CallContext } from '../server/provider.js';
import { summaryFacts, verifiedSummary } from '../server/summary.js';
import { qualityCases, travelTask, tripGoal } from './cases.js';
export function onlinePermission(env:NodeJS.ProcessEnv){
 if(env.RUN_LIVE_AI!=='1')return {enabled:false,reason:'待执行：未单独启用在线评价。'};
 if(env.PAID_TEST_AUTHORIZED!=='yes')return {enabled:false,reason:'待执行：缺少用户明确授权的确认开关。'};
 if(!env.OPENAI_API_KEY?.trim()||!env.OPENAI_MODEL?.trim())return {enabled:false,reason:'待执行：缺少服务端凭证或模型。'};
 if(env.QUALITY_PREFLIGHT_CONFIRMED!=='yes')return {enabled:false,reason:'待执行：请先核对官方模型、价格和结构化支持。'};
 return {enabled:true,reason:''};
}
export function requestBudget(env:NodeJS.ProcessEnv){return z.coerce.number().int().min(1).max(12).parse(env.QUALITY_MAX_REQUESTS||10);}
export function budgetContext(max:number,signal:AbortSignal){let calls=0;return {context:{signal,consume(){if(signal.aborted)throw new ProviderError(409,'cancelled','评价已取消。');if(calls>=max)throw new ProviderError(429,'quality_budget','在线评价请求上限已达，已停止。');calls++;}} as CallContext,count:()=>calls};}
export interface QualityResult{id:string;status:'needs_review'|'fail'|'cancelled'|'not_run';checks:Record<string,boolean>;data?:unknown;errorCode?:string;humanReview:string;}
const noGrammar=(r:Evaluation)=>!r.diagnosis.issues.some(i=>i.category==='grammar');
export function diagnosticChecks(id:string,r:DiagnosticResult):Record<string,boolean>{const text=r.diagnosis.issues.map(i=>[i.natural,i.explanation,...i.chunks].join(' ')).join(' ');if(id==='A')return {tripChunk:/\b(?:go|went) on a trip\b/i.test(text),onExplanation:/\bon\b/.test(text),notNoIssue:r.diagnosis.issues.some(i=>i.category!=='no_issue')};if(id==='B')return {naturalSuggestion:/gain.*knowledge|learn.*about/i.test(text),noAbsoluteBan:!/(?:never|absolutely forbidden).*learn.*knowledge|learn.*knowledge.*(?:绝不能|永远不能|绝对禁止)/i.test(text)};return {noIssue:r.diagnosis.issues.length===1&&r.diagnosis.issues[0].category==='no_issue',noForcedGoal:r.target===null};}
export function evaluationChecks(id:string,r:Evaluation):Record<string,boolean>{const d=r.dimensions;if(id==='D')return {correctLanguage:d?.languageAccuracy==='correct',natural:d?.naturalness==='natural',informationMatches:d?.taskCompletion==='complete',noGrammarError:noGrammar(r),retrievalNotAssumed:d?.targetRetrieval==='not_used',notFullRetrievalSuccess:r.verdict!=='success'};return {correctLanguage:d?.languageAccuracy==='correct',correctTripEvidence:d?.targetRetrieval==='used',wrongInformation:d?.taskCompletion==='incorrect'||d?.taskCompletion==='partial',noGrammarError:noGrammar(r),notComplete:r.verdict!=='success'};}
export async function runQuality(provider:TeachingProvider,ctx:CallContext){
 const results:QualityResult[]=[];let diagnosisA:DiagnosticResult|undefined;let history:ReturnType<TeachingStore['view']>['record']=null;
 for(const item of qualityCases){
  if(ctx.signal.aborted){results.push({id:item.id,status:'cancelled',checks:{},humanReview:'取消，未执行该案例。'});continue;}
  try{let data:unknown;let checks:Record<string,boolean>={};
   if(['A','B','C'].includes(item.id)){const r=await provider.diagnose(item.input,'campus',ctx,'描述去年去杭州的旅行或说明学习目标');data=r;checks=diagnosticChecks(item.id,r);if(item.id==='A')diagnosisA=r;}
   else if(item.id==='D'||item.id==='G'){const r=await provider.evaluate(item.input,travelTask,ctx);data=r;checks=evaluationChecks(item.id,r);}
   else if(item.id==='E'){
    if(!provider.generateTask)throw new ProviderError(502,'missing','Provider无生成能力。');
    const t=await provider.generateTask({target:tripGoal,index:1,kind:'transfer',difficulty:'normal',scenario:'campus',sourceText:qualityCases[0].input,previousPrompts:[travelTask.prompt]},ctx);
    data={publicPrompt:t.prompt,privateReference:t.reference};checks={noEnglish:/\p{Script=Latin}/u.test(t.prompt.normalize('NFKC'))===false,newSituation:t.prompt!==travelTask.prompt};
   }else if(item.id==='F'){
    if(!diagnosisA?.target)throw new ProviderError(502,'setup','A未提供可靠目标，F待人工设置，不追加收费请求。');
    // Use the actual A result and deterministic private task fixture. Only evaluate costs one extra call.
    const wrapped:TeachingProvider={id:provider.id,diagnose:()=>diagnosisA!,generateTask:async()=>({...travelTask,id:randomUUID(),kind:'practice'}),evaluate:(text,task,context)=>provider.evaluate(text,{...task,goal:tripGoal},context)};
    const store=new TeachingStore(wrapped);let s=await store.start({requestId:randomUUID(),mode:'diagnosis',scenario:'campus'});
    s=await store.command(s.id,{requestId:randomUUID(),revision:s.revision,type:'submit',text:qualityCases[0].input});
    s=await store.command(s.id,{requestId:randomUUID(),revision:s.revision,type:'action',action:'practice'});
    s=await store.command(s.id,{requestId:randomUUID(),revision:s.revision,type:'action',action:'hint'});
    // Share the run budget/cancellation with the model call made by the state machine.
    wrapped.evaluate=(text,task)=>provider.evaluate(text,{...task,goal:tripGoal},ctx);
    s=await store.command(s.id,{requestId:randomUUID(),revision:s.revision,type:'submit',text:item.input});history=s.record;
    data={feedback:s.feedback,record:s.record,setup:'服务端固定任务夹具，A为本次真实诊断缓存'};checks={hintRecorded:s.record?.hintCount===1,notIndependent:s.feedback?.outcome!=='first_independent_success',hintedSuccess:s.feedback?.outcome==='hinted_success'};
   }else{
    if(!history||!provider.summarize)throw new ProviderError(502,'setup','无可总结的本次历史；H未执行。');data=verifiedSummary(await provider.summarize(history,ctx),history);checks={factsGrounded:true};data={summary:data,actualFacts:summaryFacts(history)};
   }
   results.push({id:item.id,status:Object.values(checks).every(Boolean)?'needs_review':'fail',checks,data,humanReview:'必须人工核对解释、意义及教学合理性；自动检查不代表教学质量通过。'});
  }catch(e){const error=e instanceof ProviderError?e:new ProviderError(502,'unexpected','评价失败');results.push({id:item.id,status:ctx.signal.aborted?'cancelled':['quality_budget','setup'].includes(error.code)?'not_run':'fail',checks:{},errorCode:error.code,humanReview:'模型调用或质量保护失败，需人工检查；未自动重试。'});if(error.code==='quality_budget')break;}
 }
 for(const item of qualityCases)if(!results.some(r=>r.id===item.id))results.push({id:item.id,status:'not_run',checks:{},humanReview:'预算已达或前序条件未满足，未执行。'});
 return results;
}
