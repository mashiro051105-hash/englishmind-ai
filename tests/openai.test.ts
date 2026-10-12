import { test } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { OpenAIProvider, type OpenAIConfig } from '../server/openai-provider.js';
import { configuredProvider } from '../server/config.js';
import { ProviderError, type CallContext } from '../server/provider.js';
import { taskFor } from '../server/tasks.js';
const config:OpenAIConfig={apiKey:'test-placeholder-only',model:'fixture-model',timeoutMs:1000,maxOutputTokens:1800,maxCallsPerMinute:20,maxTotalCalls:20};
const goal={chunk:'gain knowledge',meaning:'增加特定领域知识',equivalents:['learn about']};
const noIssue={category:'no_issue',explanation:'自然且符合语境',natural:'Would it be possible for you to arrange a taxi for me?',chunks:[]};
function output(data:unknown){return {id:'resp_fixture',object:'response',created_at:1,status:'completed',error:null,incomplete_details:null,output:[{id:'msg_fixture',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:typeof data==='string'?data:JSON.stringify(data),annotations:[]}]}]};}
function adapter(data:unknown,options:{status?:number,envelope?:boolean,config?:Partial<OpenAIConfig>}={}){
 const requests:Record<string,unknown>[]=[];
 const client=new OpenAI({apiKey:'test-placeholder-only',maxRetries:0,fetch:async(_url,init)=>{requests.push(JSON.parse(init?.body as string));return new Response(JSON.stringify(options.envelope?data:options.status?{error:{message:'private-upstream-detail',type:'api_error'}}:output(data)),{status:options.status??200,headers:{'Content-Type':'application/json'}});}});
 return {provider:new OpenAIProvider({...config,...options.config},client),requests};
}
function context():CallContext{return {signal:new AbortController().signal,consume:()=>{}};}
test('官方SDK请求使用环境模型、严格Schema、store=false与输出额度；正确表达不设目标',async()=>{
 const {provider,requests}=adapter({assessment:'assessed',issues:[noIssue],goal:null});const d=await provider.diagnose(noIssue.natural,'campus',context(),'礼貌请求帮助');assert.equal(d.target,null);assert.equal(d.diagnosis.issues[0].category,'no_issue');assert.equal(d.diagnosis.original,noIssue.natural);
 const r=requests[0];assert.equal(r.model,'fixture-model');assert.equal(r.store,false);assert.equal(r.max_output_tokens,1800);assert.equal((r.text as {format:{strict:boolean}}).format.strict,true);assert.match(r.input as string,/礼貌请求帮助/);
});
test('合理等效表达可得到语义成功，不依据参考字符串',async()=>{
 const {provider}=adapter({verdict:'success',dimensions:{languageAccuracy:'correct',naturalness:'natural',taskCompletion:'complete',targetRetrieval:'equivalent',evidence:[noIssue.natural]},meaningCorrect:true,naturalAndAppropriate:true,targetOrEquivalentUsed:true,reason:'意图和对象相符，等效礼貌框架正确',assessment:'assessed',issues:[noIssue]});const task=taskFor('request',1,'transfer');
 assert.notEqual(noIssue.natural,task.reference);const result=await provider.evaluate(noIssue.natural,task,context());assert.equal(result.verdict,'success');
});
test('动态任务私有参考不公开、中文任务无答案；泄露英语或相同情境被拒绝',async()=>{
 const input={target:goal,kind:'transfer' as const,difficulty:'normal' as const,index:1,scenario:'campus' as const,previousPrompts:['你向同学说明自己的学习目标。'],sourceText:'I want to gain more knowledge.'};
 const safe={prompt:'你报名社区烹饪课程，向老师说明希望了解更多烹饪知识。',meaning:'表达学习烹饪知识的目标',reference:'I hope to learn more about cooking.',hint:'使用表示了解一个主题的搭配。',contextId:'社区烹饪课程'};
 const generated=await adapter(safe).provider.generateTask(input,context());assert.equal(generated.reference,safe.reference);assert.equal(generated.goal?.chunk,goal.chunk);
 for(const prompt of ['请用 gain knowledge 表达你的学习目标。','例如：你可以使用获得知识的句型。',input.previousPrompts[0]])await assert.rejects(()=>adapter({...safe,prompt}).provider.generateTask(input,context()),ProviderError);
});
test('异常JSON、Schema、额外伪造历史、矛盾成功、不完整和拒绝输出均失败',async()=>{
 for(const data of ['{bad',{assessment:'assessed',issues:[],goal:null},{assessment:'assessed',issues:[noIssue],goal},{assessment:'assessed',issues:[noIssue],goal:null,mastered:true}])await assert.rejects(()=>adapter(data).provider.diagnose('English text','campus',context()),ProviderError);
 await assert.rejects(()=>adapter({verdict:'success',dimensions:{languageAccuracy:'correct',naturalness:'natural',taskCompletion:'complete',targetRetrieval:'equivalent',evidence:[noIssue.natural]},meaningCorrect:false,naturalAndAppropriate:true,targetOrEquivalentUsed:true,reason:'fake',assessment:'assessed',issues:[noIssue]}).provider.evaluate('x',taskFor('request',1,'transfer'),context()),ProviderError);
 await assert.rejects(()=>adapter({...output({}),status:'incomplete'},{envelope:true}).provider.diagnose('x','campus',context()),ProviderError);
 await assert.rejects(()=>adapter({...output({}),output:[{type:'message',content:[{type:'refusal',refusal:'cannot'}]}]},{envelope:true}).provider.diagnose('x','campus',context()),ProviderError);
});
test('上游429/401/500/400错误映射不泄露上游详情，且不自动重试',async()=>{
 for(const [status,expected] of [[429,429],[401,503],[500,502],[400,502]]){const {provider,requests}=adapter({}, {status});await assert.rejects(()=>provider.diagnose('x','campus',context()),(e:unknown)=>{assert.ok(e instanceof ProviderError);assert.equal(e.status,expected);assert.doesNotMatch(e.message,/private-upstream-detail/);return true;});assert.equal(requests.length,1);}
});
test('SDK真实取消信号产生可重试504超时',async()=>{
 const client=new OpenAI({apiKey:'test-only',timeout:15,maxRetries:0,fetch:async(_url,init)=>new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});})});
 await assert.rejects(()=>new OpenAIProvider(config,client).diagnose('x','campus',context()),(e:unknown)=>e instanceof ProviderError&&e.status===504);
});
test('调用频率/总调用预算包括失败，缺少配置不回退Mock',async()=>{
 const {provider}=adapter('{bad',{config:{maxTotalCalls:1}});await assert.rejects(()=>provider.diagnose('x','campus',context()));await assert.rejects(()=>provider.diagnose('x','campus',context()),(e:unknown)=>e instanceof ProviderError&&e.status===429);
 assert.equal(configuredProvider({AI_PROVIDER:'openai'}).provider,null);assert.equal(configuredProvider({AI_PROVIDER:'coze'}).provider,null);assert.equal(configuredProvider({AI_PROVIDER:'mock'}).name,'mock');
});
test('迁移情境仅更换一个名词、矛盾诊断目标、过长输出被拒绝',async()=>{
 const source='向同学介绍自己希望学习更多天文学知识并说明学习目标。';const input={target:goal,kind:'transfer' as const,difficulty:'normal' as const,index:1,scenario:'campus' as const,previousPrompts:[source],sourceText:'I want to gain knowledge.'};
 await assert.rejects(()=>adapter({prompt:source.replace('天文学','物理学'),meaning:'增加物理知识',reference:'I want to learn about physics.',hint:'使用学习主题搭配。',contextId:'同学交流'}).provider.generateTask(input,context()),ProviderError);
 await assert.rejects(()=>adapter({assessment:'assessed',issues:[{category:'collocation',explanation:'x',natural:'I gain knowledge.',chunks:['gain knowledge']}],goal:{...goal,chunk:'make a decision'}}).provider.diagnose('x','campus',context()),ProviderError);
 await assert.rejects(()=>adapter('x'.repeat(16001)).provider.diagnose('x','campus',context()),ProviderError);
});
test('自然visit与旅行信息错位不制造语法错，分别保留任务和目标证据',async()=>{
 for(const [text,complete,used] of [["I'm planning to visit Xi'an this summer.",true,false],["I'm going on a trip to Hangzhou next winter.",false,true]] as const){
  const {provider}=adapter({verdict:complete?'partial':'failure',dimensions:{languageAccuracy:'correct',naturalness:'natural',taskCompletion:complete?'complete':'incorrect',targetRetrieval:used?'used':'not_used',evidence:[text]},meaningCorrect:complete,naturalAndAppropriate:true,targetOrEquivalentUsed:used,reason:'语言正确，任务信息与词块分别检查',assessment:'assessed',issues:[{...noIssue,natural:text}]});
  const result=await provider.evaluate(text,{...taskFor('request',1,'transfer'),goal:{chunk:'go on a trip',meaning:'今年夏天去西安旅行',equivalents:['take a trip']}},context());assert.equal(result.diagnosis.issues[0].category,'no_issue');assert.notEqual(result.verdict,'success');assert.equal(result.dimensions?.languageAccuracy,'correct');
 }
});
test('矛盾分类与虚构检索证据被拒绝，遥测不含输入/密钥且记录真实usage估算',async()=>{
 const text='I went on a trip.';
 for(const issues of [[{...noIssue,category:'grammar',natural:text}],[{...noIssue,natural:text}]]){const {provider}=adapter({verdict:'success',dimensions:{languageAccuracy:'correct',naturalness:'natural',taskCompletion:'complete',targetRetrieval:'used',evidence:['invented quotation']},meaningCorrect:true,naturalAndAppropriate:true,targetOrEquivalentUsed:true,reason:'x',assessment:'assessed',issues});await assert.rejects(()=>provider.evaluate(text,taskFor('request',1,'transfer'),context()),ProviderError);}
 const events:unknown[]=[];const raw={...output({assessment:'assessed',issues:[noIssue],goal:null}),usage:{input_tokens:1000,input_tokens_details:{cached_tokens:500},output_tokens:200}};const {provider}=adapter(raw,{envelope:true,config:{rates:{input:2,cachedInput:0.1,output:10},onTelemetry:e=>events.push(e)}});await provider.diagnose('sensitive-student-input','campus',context());const serialized=JSON.stringify(events);assert.doesNotMatch(serialized,/sensitive-student-input|test-placeholder-only|apiKey/);assert.match(serialized,/0.00305/);assert.match(serialized,/inputTokens/);
});
test('在线工具硬预算和取消在发请求前阻断SDK，不会自动增加请求',async()=>{
 const {budgetContext}=await import('../quality/runner.js');const controller=new AbortController();const budget=budgetContext(1,controller.signal);const {provider,requests}=adapter({assessment:'assessed',issues:[noIssue],goal:null});await provider.diagnose('one','campus',budget.context);await assert.rejects(()=>provider.diagnose('two','campus',budget.context));assert.equal(requests.length,1);controller.abort();await assert.rejects(()=>provider.diagnose('three','campus',budget.context));assert.equal(requests.length,1);
});
test('模型权限预检保留脱敏错误分类，不发生成请求且不自动重试',async()=>{
 for(const [status,code] of [[401,'authentication'],[403,'permission'],[404,'model_not_found'],[429,'rate_limit'],[500,'upstream']] as const){
  let calls=0;const client=new OpenAI({apiKey:'test-only',maxRetries:0,fetch:async()=>{calls++;return new Response(JSON.stringify({error:{message:'private-api-secret-detail'}}),{status,headers:{'Content-Type':'application/json'}});}});
  const provider=new OpenAIProvider(config,client);
  await assert.rejects(()=>provider.verifyModelAccess(context()),(e:unknown)=>e instanceof ProviderError&&e.code===code&&e.status===status&&!e.message.includes('private-api-secret-detail'));
  assert.equal(calls,1);
 }
});
