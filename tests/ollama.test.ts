import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { OllamaProvider,localEndpoint,type OllamaConfig } from '../server/ollama-provider.js';
import { ProviderError } from '../server/provider.js';
import { configuredProvider } from '../server/config.js';
import { TeachingStore } from '../server/teaching.js';
import { travelTask,tripGoal } from '../quality/cases.js';
const config:OllamaConfig={baseUrl:'http://127.0.0.1:11434',model:'fixture-local',timeoutMs:100,numCtx:4096,maxOutputTokens:1800,maxCallsPerMinute:20,maxTotalCalls:20};
const ctx=()=>({signal:new AbortController().signal,consume:()=>{}});
const issue={category:'no_issue',explanation:'自然英语，信息与词块另行评价。',natural:"I'm planning to visit Xi'an this summer.",chunks:[]};
const envelope=(data:unknown)=>new Response(JSON.stringify({done:true,done_reason:'stop',message:{content:typeof data==='string'?data:JSON.stringify(data)},prompt_eval_count:100,eval_count:50}));
test('Ollama官方API携带Schema/本地模型/有限上下文，无Key、不下载模型；正确表达不强行纠错',async()=>{
 let called=0;const provider=new OllamaProvider(config,async(url,init)=>{called++;assert.equal(url,'http://127.0.0.1:11434/api/chat');assert.doesNotMatch(JSON.stringify(init?.headers),/authorization|api.key/i);const body=JSON.parse(String(init?.body));assert.equal(body.model,'fixture-local');assert.equal(body.stream,false);assert.equal(body.think,false);assert.equal(body.options.num_ctx,4096);assert.equal(body.options.temperature,0);assert.ok(body.format.properties.goal);return envelope({assessment:'assessed',issues:[issue],goal:null});});
 const r=await provider.diagnose(issue.natural,'campus',ctx());assert.equal(r.target,null);assert.equal(r.diagnosis.issues[0].category,'no_issue');assert.equal(provider.id,'ollama');assert.equal(called,1);
});
test('本地替代自然表达不造语法错，Schema/异常JSON/未完成/服务错误被拒绝',async()=>{
 const data={verdict:'partial',dimensions:{languageAccuracy:'correct',naturalness:'natural',taskCompletion:'complete',targetRetrieval:'not_used',evidence:[issue.natural]},meaningCorrect:true,naturalAndAppropriate:true,targetOrEquivalentUsed:false,reason:'visit正确但本题未检索旅行词块。',assessment:'assessed',issues:[issue]};
 const r=await new OllamaProvider(config,async()=>envelope(data)).evaluate(issue.natural,travelTask,ctx());assert.equal(r.verdict,'partial');assert.equal(r.diagnosis.issues[0].category,'no_issue');
 for(const response of [envelope('{bad'),envelope({fake:true}),new Response('{bad'),new Response(JSON.stringify({done:false,message:{content:'{}'}})),new Response('{}',{status:404}),new Response('secret upstream detail',{status:500})]){
  await assert.rejects(()=>new OllamaProvider(config,async()=>response).diagnose('x','campus',ctx()),(e:unknown)=>e instanceof ProviderError&&!e.message.includes('secret upstream detail'));
 }
});
test('本地超时/取消/连接失败可恢复，禁云模型、远程接口及生产入口；默认仍Mock',async()=>{
 const fetcher:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new Error('abort')),{once:true});});
 // Keep node alive while AbortSignal.timeout's unref timer is pending.
 const keep=setInterval(()=>{},100);
 try{await assert.rejects(()=>new OllamaProvider({...config,timeoutMs:10},fetcher).diagnose('x','campus',ctx()),(e:unknown)=>e instanceof ProviderError&&e.code==='timeout');}finally{clearInterval(keep);}
 const controller=new AbortController();controller.abort();await assert.rejects(()=>new OllamaProvider(config).diagnose('x','campus',{signal:controller.signal,consume(){}}),ProviderError);
 await assert.rejects(()=>new OllamaProvider(config,async()=>{throw Error('private-error');}).diagnose('x','campus',ctx()),(e:unknown)=>e instanceof ProviderError&&e.code==='local_connection');
 for(const url of ['https://ollama.com','http://evil.example','http://user:pass@localhost:11434','http://localhost:11434/proxy','http://localhost:11434/?token=x'])assert.throws(()=>localEndpoint(url));
 assert.throws(()=>new OllamaProvider({...config,model:'model:cloud'}));assert.equal(configuredProvider({}).name,'mock');assert.equal(configuredProvider({AI_PROVIDER:'ollama'}).provider,null);assert.equal(configuredProvider({AI_PROVIDER:'ollama',OLLAMA_MODEL:'qwen3:4b'}).provider?.id,'ollama');assert.equal(configuredProvider({AI_PROVIDER:'ollama',OLLAMA_MODEL:'qwen3:4b',NODE_ENV:'production'}).provider,null);
});
test('本地诊断→动态独立任务→迁移评价→结束复用状态机；泄露任务拒绝且历史不变',async()=>{
 let leak=false;
 const provider=new OllamaProvider(config,async(_url,init)=>{
  const b=JSON.parse(String(init!.body));const p=b.format.properties;const input=JSON.parse(b.messages[1].content);
  if(p.goal)return envelope({assessment:'assessed',issues:[{category:'collocation',explanation:'需要on。',natural:'I went on a trip to Hangzhou last year.',chunks:['go on a trip']}],goal:tripGoal});
  if(p.contextId)return envelope({prompt:leak?'请用 go on a trip 回答':input.kind==='practice'?'告诉室友今年夏天你打算去西安旅行。':'旅行社询问，你计划明年春天带父母去苏州游玩，请说明安排。',meaning:'介绍旅行安排',reference:input.kind==='practice'?"I'm going on a trip to Xi'an this summer.":"I'll go on a trip to Suzhou with my parents next spring.",hint:'表达旅行安排，注意介词。',contextId:input.kind});
  return envelope({verdict:'success',dimensions:{languageAccuracy:'correct',naturalness:'natural',taskCompletion:'complete',targetRetrieval:'used',evidence:[input.text]},meaningCorrect:true,naturalAndAppropriate:true,targetOrEquivalentUsed:true,reason:'本题完成，不代表长期掌握。',assessment:'assessed',issues:[{...issue,natural:input.text}]});
 });
 const store=new TeachingStore(provider);let s=await store.start({requestId:randomUUID(),mode:'diagnosis',scenario:'campus'});
 const submit=async(text:string)=>s=await store.command(s.id,{requestId:randomUUID(),revision:s.revision,type:'submit',text});
 const action=async(action:'practice'|'transfer'|'finish')=>s=await store.command(s.id,{requestId:randomUUID(),revision:s.revision,type:'action',action});
 await submit('I went a trip to Hangzhou last year.');leak=true;await assert.rejects(()=>action('practice'),ProviderError);assert.equal(store.view(s.id).revision,s.revision);leak=false;
 await action('practice');assert.doesNotMatch(JSON.stringify(s.task),/go on a trip|reference|goal/);assert.equal(s.record,null);assert.equal(s.feedback,null);
 await submit("I'm going on a trip to Xi'an this summer.");await action('transfer');await submit("I'll go on a trip to Suzhou with my parents next spring.");await action('finish');assert.equal(s.provider,'ollama');assert.equal(s.phase,'completed');assert.deepEqual(s.record!.transferResults,['first_independent_success']);
});
test('真实回环HTTP贯通Express与模拟Ollama官方端点，不需要付费入口且记录本地Provider',async()=>{
 const { createServer }=await import('node:http');const { createApp }=await import('../server/app.js');let calls=0;
 const local=createServer(async(req,res)=>{assert.equal(req.url,'/api/chat');assert.equal(req.headers.authorization,undefined);let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);assert.ok(data.format.properties.goal);calls++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({done:true,message:{content:JSON.stringify({assessment:'assessed',issues:[issue],goal:null})}}));});
 await new Promise<void>(resolve=>local.listen(0,'127.0.0.1',resolve));const port=(local.address() as {port:number}).port;
 const app=createApp('ollama',undefined,new OllamaProvider({...config,baseUrl:`http://127.0.0.1:${port}`,timeoutMs:1000}));const web=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>web.on('listening',resolve));const url=`http://127.0.0.1:${(web.address() as {port:number}).port}`;
 try{
  const bootstrap=await fetch(url+'/api/bootstrap');const access=await bootstrap.json();assert.equal(access.accessRequired,false);const cookie=bootstrap.headers.get('set-cookie')!.split(';')[0];
  const post=async(path:string,body:unknown)=>{const r=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
  let s=await post('/api/training',{requestId:randomUUID(),mode:'diagnosis',scenario:'campus'});s=await post(`/api/training/${s.id}/commands`,{requestId:randomUUID(),revision:s.revision,type:'submit',text:issue.natural});assert.equal(s.provider,'ollama');assert.equal(s.record.provider,'ollama');assert.equal(s.feedback.diagnosis.issues[0].category,'no_issue');assert.deepEqual(s.record.transferResults,[]);assert.equal(calls,1);
 }finally{await Promise.all([new Promise<void>(resolve=>web.close(()=>resolve())),new Promise<void>(resolve=>local.close(()=>resolve()))]);}
});
