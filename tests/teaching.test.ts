import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeachingStore, TeachingError, chooseDecision } from '../server/teaching.js';
import { mockProvider } from '../server/mock.js';
import { taskFor } from '../server/tasks.js';
import { RecordSchema, SessionSchema, type Session, type Command } from '../shared/contracts.js';
import TrainingPanel from '../src/TrainingPanel.js';
import type { useTeaching } from '../src/useTeaching.js';
async function start(store:TeachingStore,mode:'diagnosis'|'transfer'='diagnosis',focus:'intensity'|'knowledge'|'request'='knowledge'){return await store.start({requestId:randomUUID(),mode,focus,scenario:'campus'});}
async function command(store:TeachingStore,s:Session,input:{type:'submit',text:string}|{type:'action',action:Extract<Command,{type:'action'}>['action']}|{type:'reset'}){return await store.command(s.id,{...input,revision:s.revision,requestId:randomUUID()});}
async function submit(store:TeachingStore,s:Session,text:string){return await command(store,s,{type:'submit',text});}
async function action(store:TeachingStore,s:Session,action:Extract<Command,{type:'action'}>['action']){return await command(store,s,{type:'action',action});}
async function transfer(store:TeachingStore){let s=await start(store);s=await submit(store,s,'I want to learn more knowledge.');s=await action(store,s,'practice');s=await submit(store,s,'I want to gain knowledge about astronomy.');return await action(store,s,'transfer');}
function assertNoLeak(s:Session){const json=JSON.stringify(s);assert.equal(s.phase,'awaiting');assert.equal(s.feedback,null);assert.equal(s.record,null);assert.doesNotMatch(json,/natural|reference|chunks|gain knowledge|learn about|Could you|really like/);assert.ok(SessionSchema.safeParse(s).success);}

test('开始情境训练及进入练习/迁移时 API 和渲染内容不泄露答案',async()=>{
 const store=new TeachingStore();const initial=await start(store,'transfer');assertNoLeak(initial);
 let s=await start(store);assert.equal(s.feedback,null);s=await submit(store,s,'I want to learn more knowledge.');assert.equal(s.phase,'feedback');assert.equal(s.feedback?.diagnosis.issues[0].category,'collocation');assert.equal(s.record?.attempts.length,1);
 s=await action(store,s,'practice');assertNoLeak(s);s=await submit(store,s,'I hope to learn about astronomy.');s=await action(store,s,'transfer');assertNoLeak(s);assert.notEqual(s.task.prompt,initial.task.prompt);
 const html=renderToStaticMarkup(createElement(TrainingPanel,{mode:'transfer',teaching:{session:s,busy:false,error:'',pending:null} as ReturnType<typeof useTeaching>}));
 assert.doesNotMatch(html,/gain knowledge|learn about|自然表达建议|I want to/);assert.match(html,/烹饪/);
});
test('完整诊断→独立训练→迁移→完成→增加情境闭环，记录仅实际结果',async()=>{
 const store=new TeachingStore();let s=await transfer(store);assert.equal(store.view(s.id).record,null);
 s=await submit(store,s,'I would like to acquire more knowledge about cooking.');assert.equal(s.feedback?.outcome,'first_independent_success');assert.equal(s.feedback?.decision,'finish');assert.deepEqual(s.record?.transferResults,['first_independent_success']);assert.equal(s.record?.attempts.length,3);
 s=await action(store,s,'challenge');assert.equal(s.task.difficulty,'challenge');assert.match(s.task.prompt,/机器人/);assertNoLeak(s);
 s=await submit(store,s,'I hope to learn about robotics.');assert.equal(s.feedback?.outcome,'first_independent_success');s=await action(store,s,'finish');assert.equal(s.phase,'completed');assert.equal(s.record?.status,'completed');assert.equal(s.record?.transferResults.length,2);
});
test('非完全匹配的词块替代及意义/语境对象正确才成功',async()=>{
 const hotel=taskFor('request',1,'transfer');
 for(const text of ['Could you please book a cab for me?','Would you mind calling a taxi for me?','Can I get a taxi, please?'])assert.equal(mockProvider.evaluate(text,hotel).verdict,'success',text);
 for(const text of ['Could you share your notes with me?','Could you not call a taxi for me?','I said "Could you call a taxi for me?"','Could you call a taxi for him?','Could you call a taxi for me but I hate taxis?'])assert.notEqual(mockProvider.evaluate(text,hotel).verdict,'success',text);
 for(const text of ['I really enjoy hiking.','I like hiking very much.','I absolutely love hiking.'])assert.equal(mockProvider.evaluate(text,taskFor('intensity',1,'transfer')).verdict,'success',text);
 assert.notEqual(mockProvider.evaluate('I really like hiking is bad.',taskFor('intensity',1,'transfer')).verdict,'success');
});
test('部分成功→主动提示→新作答为提示后成功，提示/重试次数真实',async()=>{
 const store=new TeachingStore();let s=await transfer(store);s=await submit(store,s,'I want to learn more knowledge about cooking.');assert.equal(s.feedback?.outcome,'partial');assert.equal(s.feedback?.decision,'hint');
 s=await action(store,s,'hint');assert.ok(s.hint);assert.equal(s.feedback,null);s=await submit(store,s,'I would like to learn about cooking.');assert.equal(s.feedback?.outcome,'hinted_success');assert.equal(s.record?.hintCount,1);assert.equal(s.record?.retryCount,1);
});
test('首次作答前请求提示后成功不算独立，重复请求提示被拒绝',async()=>{
 const store=new TeachingStore();let s=await transfer(store);s=await action(store,s,'hint');const sameRevision=s.revision;
 await assert.rejects(async()=>await action(store,s,'hint'));assert.equal(store.view(s.id).revision,sameRevision);
 s=await submit(store,s,'I would like to learn about cooking.');assert.equal(s.feedback?.outcome,'hinted_success');assert.equal(s.record?.hintCount,1);assert.equal(s.record?.retryCount,0);
});
test('错误情境→失败→降低难度→新作答为重试成功；两次失败建议结束',async()=>{
 const store=new TeachingStore();let s=await transfer(store);s=await submit(store,s,'I hope to learn about astronomy.');assert.equal(s.feedback?.outcome,'failure');assert.equal(s.feedback?.decision,'lower');
 s=await action(store,s,'lower');assert.equal(s.task.difficulty,'easy');s=await submit(store,s,'I would like to learn about cooking.');assert.equal(s.feedback?.outcome,'retry_success');assert.equal(s.record?.retryCount,1);
 let other=await transfer(store);other=await submit(store,other,'I hope to learn about astronomy.');other=await action(store,other,'lower');other=await submit(store,other,'I want to acquire knowledge about astronomy.');assert.equal(other.feedback?.decision,'finish');
});
test('照抄已见原句/参考答案不能作为首次独立或重试检索成功',async()=>{
 const store=new TeachingStore();let s=await transfer(store);s=await submit(store,s,'I want to gain knowledge about astronomy.');assert.equal(s.feedback?.outcome,'copied_answer');
 s=await action(store,s,'retry');s=await submit(store,s,'I hope to learn about cooking.');assert.equal(s.feedback?.outcome,'retry_success');
 const second=new TeachingStore();let t=await transfer(second);t=await submit(second,t,'I want to learn more knowledge about cooking.');t=await action(second,t,'hint');t=await submit(second,t,'I hope to learn more about cooking.');assert.equal(t.feedback?.outcome,'copied_answer');
});
test('正确输入和未知输入不强行分配训练目标，未完成迁移不能出现成功',async()=>{
 const store=new TeachingStore();let s=await start(store);s=await submit(store,s,'Could you help me with this assignment?');assert.equal(s.feedback?.diagnosis.issues[0].category,'no_issue');assert.deepEqual(s.allowedActions,['finish']);assert.equal(s.record?.target,null);assert.deepEqual(s.record?.transferResults,[]);
 s=await action(store,s,'finish');assert.equal(s.record?.status,'completed');assert.deepEqual(s.record?.transferResults,[]);
 let unknown=await start(store);unknown=await submit(store,unknown,'Unknown free expression.');assert.equal(unknown.feedback?.diagnosis.assessment,'unassessed');assert.deepEqual(unknown.allowedActions,['finish']);
 let unfinished=await transfer(store);unfinished=await command(store,unfinished,{type:'reset'});assert.equal(unfinished.record?.status,'stopped');assert.deepEqual(unfinished.record?.transferResults,[]);
 assert.equal(RecordSchema.safeParse({...unfinished.record,transferResults:['first_independent_success']}).success,false);
});
test('开始和提交幂等、非法转换、空输入和过期版本不修改状态',async()=>{
 const store=new TeachingStore();const body={requestId:randomUUID(),mode:'diagnosis',scenario:'campus'};let s=await store.start(body);assert.equal((await store.start(body)).id,s.id);await assert.rejects(async()=>await store.start({...body,mode:'transfer'}));
 for(const input of [{type:'submit',text:' '},{type:'action',action:'transfer'}]){await assert.rejects(async()=>await store.command(s.id,{...input,requestId:randomUUID(),revision:s.revision}));assert.equal(store.view(s.id).revision,0);}
 const submission={type:'submit',text:'I very like English.',requestId:randomUUID(),revision:0};s=await store.command(s.id,submission);assert.equal((await store.command(s.id,submission)).revision,1);assert.equal(store.view(s.id).record?.attempts.length,1);
 await assert.rejects(async()=>await store.command(s.id,{...submission,text:'Other text'}));
 await assert.rejects(async()=>await store.command(s.id,{...submission,requestId:randomUUID()}));
 await assert.rejects(async()=>await submit(store,s,'I very like English.'));
 assert.equal(store.view(s.id).record?.attempts.length,1);s=await command(store,s,{type:'reset'});assert.equal(s.record?.status,'stopped');await assert.rejects(async()=>await submit(store,s,'Hi'));
});
test('刷新恢复真实状态，服务重启/TTL/容量上限明确失效',async()=>{
 let clock=Date.now();const store=new TeachingStore(mockProvider,()=>clock,1000,1);let s=await start(store);await assert.rejects(async()=>await start(store));s=await submit(store,s,'I very like English.');assert.deepEqual(store.view(s.id),s);
 await assert.rejects(async()=>new TeachingStore().view(s.id));clock+=1001;await assert.rejects(async()=>store.view(s.id));assert.ok(await start(store));
});
test('决策为可测试的纯函数',async()=>{assert.equal(chooseDecision('first_independent_success','practice',1),'transfer');assert.equal(chooseDecision('hinted_success','transfer',2),'finish');assert.equal(chooseDecision('failure','transfer',1),'lower');assert.equal(chooseDecision('failure','transfer',2),'finish');assert.equal(chooseDecision('unassessed','transfer',1),'retry');});
test('语法目标训练同样能走通，主动提示后的初练与迁移分别计数',async()=>{
 const store=new TeachingStore();let s=await start(store,'transfer','intensity');s=await submit(store,s,'I very like photography.');assert.equal(s.feedback?.diagnosis.issues[0].category,'grammar');assert.equal(s.feedback?.outcome,'partial');s=await action(store,s,'hint');s=await submit(store,s,'I absolutely love photography.');assert.equal(s.feedback?.outcome,'hinted_success');s=await action(store,s,'transfer');s=await submit(store,s,'I like hiking very much.');assert.equal(s.feedback?.outcome,'first_independent_success');assert.equal(s.record?.hintCount,1);assert.deepEqual(s.record?.transferResults,['first_independent_success']);
});
test('合理但未覆盖的礼貌句式为未评估，不捏造搭配或语境错误',async()=>{
 for(const text of ['Would it be possible for you to arrange a taxi for me?','Could you please help me call a taxi?']){const result=mockProvider.evaluate(text,taskFor('request',1,'transfer'));assert.equal(result.verdict,'unassessed');assert.equal(result.diagnosis.assessment,'unassessed');assert.deepEqual(result.diagnosis.issues,[]);}
});
test('反馈渲染只在提交后出现，进入下题即移除',async()=>{
 const store=new TeachingStore();let s=await start(store);s=await submit(store,s,'I want to learn more knowledge.');const props=(value:Session)=>({mode:'diagnosis' as const,teaching:{session:value,busy:false,error:'',pending:null} as ReturnType<typeof useTeaching>});
 const feedback=renderToStaticMarkup(createElement(TrainingPanel,props(s)));assert.match(feedback,/I want to gain more knowledge/);assert.match(feedback,/自然表达建议/);
 s=await action(store,s,'practice');const awaiting=renderToStaticMarkup(createElement(TrainingPanel,props(s)));assert.doesNotMatch(awaiting,/I want to gain more knowledge|本轮目标词块|自然表达建议/);
});
test('provider不能将未评估当作成功，也不能对no_issue强行指定错误目标',async()=>{
 const wrong={...mockProvider,evaluate:(text:string)=>({verdict:'success' as const,reason:'fake',diagnosis:{original:text,assessment:'unassessed' as const,issues:[],nextAction:'finish' as const}})};
 const store=new TeachingStore(wrong);const s=await start(store,'transfer');await assert.rejects(async()=>await submit(store,s,'Unknown expression.'));assert.deepEqual(store.view(s.id),s);
 const forced={...mockProvider,diagnose:(text:string)=>({...mockProvider.diagnose(text,'campus'),target:'request' as const})};const other=new TeachingStore(forced),t=await start(other);await assert.rejects(async()=>await submit(other,t,'Could you help me with this assignment?'));assert.deepEqual(other.view(t.id),t);
});
