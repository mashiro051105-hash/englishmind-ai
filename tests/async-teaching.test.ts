import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TeachingStore } from '../server/teaching.js';
import { mockProvider } from '../server/mock.js';
import { taskFor } from '../server/tasks.js';
import { ProviderError, type TeachingProvider, type CallContext } from '../server/provider.js';
const startBody=()=>({requestId:randomUUID(),mode:'diagnosis',scenario:'campus'});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
test('异步同键提交共享一次调用，冲突操作拒绝，GET保持提交前状态',async()=>{
 const held=deferred<ReturnType<typeof mockProvider.diagnose>>();let calls=0;
 const provider:TeachingProvider={...mockProvider,diagnose:async()=>{calls++;return held.promise;}};
 const store=new TeachingStore(provider);const s=await store.start(startBody());const body={requestId:randomUUID(),revision:0,type:'submit',text:'I very like English.'};
 const first=store.command(s.id,body),duplicate=store.command(s.id,body);assert.equal(calls,1);assert.equal(store.view(s.id).phase,'awaiting');
 await assert.rejects(()=>store.command(s.id,{...body,requestId:randomUUID()}));await assert.rejects(()=>store.command(s.id,{...body,text:'Different'}));await assert.rejects(()=>store.command(s.id,{requestId:randomUUID(),revision:0,type:'reset'}));
 held.resolve(mockProvider.diagnose(body.text,'campus'));const [a,b]=await Promise.all([first,duplicate]);assert.deepEqual(a,b);assert.equal(a.revision,1);assert.equal(a.record?.attempts.length,1);
});
test('操作硬超时后迟到结果不提交；失败同键可安全重试且不记账',async()=>{
 const held=deferred<ReturnType<typeof mockProvider.diagnose>>();let calls=0;
 const provider:TeachingProvider={...mockProvider,diagnose:async()=>{calls++;return calls===1?held.promise:mockProvider.diagnose('I very like English.','campus');}};
 const store=new TeachingStore(provider,()=>Date.now(),86400000,500,{operationTimeoutMs:15,maxCallsPerSession:30});const s=await store.start(startBody());const body={requestId:randomUUID(),revision:0,type:'submit',text:'I very like English.'};
 await assert.rejects(()=>store.command(s.id,body),(e:unknown)=>e instanceof ProviderError&&e.status===504);assert.deepEqual(store.view(s.id),s);
 const retried=await store.command(s.id,body);assert.equal(retried.record?.attempts.length,1);held.resolve(mockProvider.diagnose('I very like English.','campus'));await new Promise(r=>setTimeout(r,10));assert.equal(store.view(s.id).revision,1);assert.equal(store.view(s.id).record?.attempts.length,1);
});
test('动态任务失败不会跳状态，同键重试生成成功；未迁移无成功记录',async()=>{
 let fail=true;const provider:TeachingProvider={...mockProvider,generateTask:async(input,ctx)=>{ctx.consume();if(fail)throw new ProviderError(502,'task_leak','leak');return taskFor('intensity',input.index,input.kind,input.difficulty);}};
 const store=new TeachingStore(provider);let s=await store.start(startBody());s=await store.command(s.id,{requestId:randomUUID(),revision:0,type:'submit',text:'I very like English.'});const before=s;const body={requestId:randomUUID(),revision:s.revision,type:'action',action:'practice'};
 await assert.rejects(()=>store.command(s.id,body));assert.deepEqual(store.view(s.id),before);fail=false;s=await store.command(s.id,body);assert.equal(s.phase,'awaiting');assert.equal(s.record,null);s=await store.command(s.id,{requestId:randomUUID(),revision:s.revision,type:'reset'});assert.deepEqual(s.record?.transferResults,[]);
});
test('开始动态任务幂等、调用预算计入失败，超额仍可停止会话',async()=>{
 const held=deferred<ReturnType<typeof taskFor>>();let calls=0;
 const provider:TeachingProvider={...mockProvider,generateTask:async(_input,ctx)=>{ctx.consume();calls++;return held.promise;},evaluate:async(text,task,ctx)=>{ctx!.consume();return mockProvider.evaluate(text,task);}};
 const store=new TeachingStore(provider,()=>Date.now(),86400000,500,{operationTimeoutMs:1000,maxCallsPerSession:1});const input={...startBody(),mode:'transfer',focus:'intensity'};
 const first=store.start(input),second=store.start(input);held.resolve(taskFor('intensity',0,'initial'));const [a,b]=await Promise.all([first,second]);assert.equal(a.id,b.id);assert.equal(calls,1);
 await assert.rejects(()=>store.command(a.id,{requestId:randomUUID(),revision:0,type:'submit',text:'I really like photography.'}),(e:unknown)=>e instanceof ProviderError&&e.status===429);assert.equal(store.view(a.id).revision,0);
 const stopped=await store.command(a.id,{requestId:randomUUID(),revision:0,type:'reset'});assert.deepEqual(stopped.record?.transferResults,[]);
});
test('显式取消在途调用，迟到响应无效且可以同键安全重试',async()=>{
 const held=deferred<ReturnType<typeof mockProvider.diagnose>>();let calls=0;const p:TeachingProvider={...mockProvider,diagnose:async()=>++calls===1?held.promise:mockProvider.diagnose('I very like English.','campus')};const store=new TeachingStore(p);const s=await store.start(startBody());const body={requestId:randomUUID(),revision:0,type:'submit',text:'I very like English.'};const request=store.command(s.id,body);assert.equal(store.cancel(s.id,'wrong'),false);assert.equal(store.cancel(s.id,body.requestId),true);await assert.rejects(()=>request);assert.equal(store.view(s.id).revision,0);const result=await store.command(s.id,body);held.resolve(mockProvider.diagnose(body.text,'campus'));await new Promise(r=>setTimeout(r,5));assert.equal(store.view(s.id).revision,1);assert.equal(result.record?.attempts.length,1);
});
