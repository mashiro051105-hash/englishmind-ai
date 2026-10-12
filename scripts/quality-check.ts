import 'dotenv/config';
import { mkdir,writeFile,chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { OpenAIProvider } from '../server/openai-provider.js';
import { ProviderError } from '../server/provider.js';
import type { RequestTelemetry } from '../server/telemetry.js';
import { budgetContext,onlinePermission,requestBudget,runQuality } from '../quality/runner.js';
import { qualityCases } from '../quality/cases.js';
const permission=onlinePermission(process.env);
if(!permission.enabled){console.log(JSON.stringify({mode:'offline-plan',status:'待执行',reason:permission.reason,onlineCalls:0,cases:qualityCases},null,2));process.exit(0);}
const max=requestBudget(process.env);const number=(key:string)=>z.coerce.number().nonnegative().finite().parse(process.env[key]);
const rates={input:number('QUALITY_INPUT_USD_PER_MILLION'),cachedInput:number('QUALITY_CACHED_USD_PER_MILLION'),output:number('QUALITY_OUTPUT_USD_PER_MILLION')};
const verified=process.env.QUALITY_PRICE_VERIFIED_DATE||'';const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);if(verified!==today)throw Error('请填写Asia/Shanghai当日价格核验日期，并先重新检查官方价格。');
const controller=new AbortController();const cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
const telemetry:RequestTelemetry[]=[];const budget=budgetContext(max,controller.signal);
const provider=new OpenAIProvider({apiKey:process.env.OPENAI_API_KEY!,model:process.env.OPENAI_MODEL!,timeoutMs:20000,maxOutputTokens:1800,maxCallsPerMinute:12,maxTotalCalls:max,rates,onTelemetry:event=>{telemetry.push(event);console.log(JSON.stringify({operation:event.operation,model:event.model,latencyMs:event.latencyMs,status:event.status,inputTokens:event.inputTokens,outputTokens:event.outputTokens,estimatedUsd:event.estimatedUsd}));}});
let results:Awaited<ReturnType<typeof runQuality>>=[];let status='待人工复核';let failure:{code:string;status:number}|null=null;
try{await provider.verifyModelAccess(budget.context);results=await runQuality(provider,budget.context);if(results.some(r=>r.status==='fail'||r.status==='not_run'||r.status==='cancelled')){status=controller.signal.aborted?'已取消':'评价未完成或失败，需检查报告';process.exitCode=controller.signal.aborted?130:1;}}catch(e){status=controller.signal.aborted?'已取消':'预检失败，未继续';failure=e instanceof ProviderError?{code:e.code,status:e.status}:{code:'unexpected',status:503};process.exitCode=1;}
finally{
 await mkdir('.artifacts',{recursive:true,mode:0o700});await chmod('.artifacts',0o700);if(results.length===0)results=qualityCases.map(c=>({id:c.id,status:'not_run',checks:{},humanReview:'预检失败或取消，未执行。'}));const report={mode:'online',failure,status:controller.signal.aborted?'已取消':status,model:process.env.OPENAI_MODEL,requestCount:budget.count(),inferenceRequestCount:telemetry.filter(t=>t.operation!=='model_access').length,maxRequests:max,rates,priceVerifiedDate:verified,estimatedUsd:telemetry.some(t=>t.operation!=='model_access'&&t.estimatedUsd===null)?null:telemetry.reduce((s,t)=>s+(t.estimatedUsd??0),0),actualBilledUsd:null,telemetry,results};
 const path=`.artifacts/quality-${randomUUID()}.json`;await writeFile(path,JSON.stringify(report,null,2),{mode:0o600});console.log('Report saved: '+path+'; actual account billing remains unverified.');process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
}
