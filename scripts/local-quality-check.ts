import 'dotenv/config';
import { mkdir,writeFile,chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { RequestTelemetry } from '../server/telemetry.js';
import { configuredProvider } from '../server/config.js';
import { budgetContext,requestBudget,runQuality } from '../quality/runner.js';
import { qualityCases } from '../quality/cases.js';
if(process.env.RUN_LOCAL_AI!=='1'){
 console.log(JSON.stringify({mode:'local-plan',status:'待执行：RUN_LOCAL_AI未启用，不连接Ollama、不下载模型。',localCalls:0,cases:qualityCases},null,2));
}else{
 const telemetry:RequestTelemetry[]=[];
 const config=configuredProvider({...process.env,AI_PROVIDER:'ollama'},event=>{telemetry.push(event);console.log(JSON.stringify({model:event.model,operation:event.operation,latencyMs:event.latencyMs,status:event.status,inputTokens:event.inputTokens,outputTokens:event.outputTokens}));});if(!config.provider)throw new Error(config.error||'本地模型未配置');
 const controller=new AbortController();const cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 const budget=budgetContext(requestBudget(process.env),controller.signal);const started=Date.now();
 try{
  const results=await runQuality(config.provider,budget.context);
  if(results.some(r=>r.status!=='needs_review'))process.exitCode=controller.signal.aborted?130:1;
  await mkdir('.artifacts',{recursive:true,mode:0o700});await chmod('.artifacts',0o700);
  const file=`.artifacts/local-quality-${randomUUID()}.json`;
  await writeFile(file,JSON.stringify({mode:'local-ollama',model:process.env.OLLAMA_MODEL,requestCount:budget.count(),latencyMs:Date.now()-started,telemetry,externalApiCalls:0,apiEstimatedUsd:0,status:'需人工复核；不代表真实教学质量合格',results},null,2),{mode:0o600});console.log('Local report saved: '+file);
 }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
