import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app.js';
import { SessionSchema, type Session } from '../shared/contracts.js';
import { TeachingStore } from '../server/teaching.js';
import { mockProvider } from '../server/mock.js';

test('真实HTTP教学闭环、并发重复提交、GET刷新、过期版本及重置',async()=>{
 const server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/training`;
 const post=(url:string,body:unknown)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const read=async(r:Response)=>{assert.equal(r.status,200);return SessionSchema.parse(await r.json());};
 try{
  const start={requestId:randomUUID(),mode:'diagnosis',scenario:'campus'};let s=await read(await post(base,start));assert.equal((await read(await post(base,start))).id,s.id);
  const id=s.id,submission={requestId:randomUUID(),revision:s.revision,type:'submit',text:'Give me your notes.'};
  const repeated=await Promise.all([post(`${base}/${id}/commands`,submission),post(`${base}/${id}/commands`,submission)]);for(const r of repeated){const v=await read(r);assert.equal(v.record?.attempts.length,1);assert.equal(v.revision,1);s=v;}
  const action=async(action:string)=>{s=await read(await post(`${base}/${id}/commands`,{requestId:randomUUID(),revision:s.revision,type:'action',action}));};
  const submit=async(text:string)=>{s=await read(await post(`${base}/${id}/commands`,{requestId:randomUUID(),revision:s.revision,type:'submit',text}));};
  assert.equal((await post(`${base}/${id}/commands`,{...submission,requestId:randomUUID()})).status,409);
  await action('practice');assert.equal(s.feedback,null);assert.equal(s.record,null);
  assert.deepEqual(await read(await fetch(`${base}/${id}`)),s);
  assert.equal((await post(`${base}/${id}/commands`,{requestId:randomUUID(),revision:s.revision,type:'submit',text:' '})).status,400);
  await submit('Would you mind sharing your notes with me?');await action('transfer');assert.match(s.task.prompt,/出租车/);assert.equal(s.record,null);
  await submit('Could you please book a cab for me?');const assessed=await read(await fetch(`${base}/${id}`));assert.equal(assessed.feedback?.outcome,'first_independent_success');await action('finish');const finished=await read(await fetch(`${base}/${id}`));assert.equal(finished.record?.transferResults.length,1);
  assert.equal((await post(`${base}/${id}/commands`,{requestId:randomUUID(),revision:s.revision,type:'submit',text:'Hello'})).status,409);
  assert.equal((await fetch(`${base}/${randomUUID()}`)).status,404);
  let unfinished=await read(await post(base,{...start,requestId:randomUUID()}));unfinished=await read(await post(`${base}/${unfinished.id}/commands`,{requestId:randomUUID(),revision:0,type:'reset'}));assert.equal(unfinished.record?.status,'stopped');assert.equal(unfinished.record?.attempts.length,0);assert.deepEqual(unfinished.record?.transferResults,[]);
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
test('无效provider结构返回502且不修改会话，便于第三阶段复用',async()=>{
 const provider={...mockProvider,diagnose:()=>({...mockProvider.diagnose('I very like English.','campus'),diagnosis:{original:'invalid'}})};
 const store=new TeachingStore(provider as unknown as typeof mockProvider);const server=createApp('mock',store).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/training`;
 try{const s=await store.start({requestId:randomUUID(),mode:'diagnosis',scenario:'campus'});const result=await fetch(`${base}/${s.id}/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),revision:0,type:'submit',text:'hello'})});assert.equal(result.status,502);assert.deepEqual(store.view(s.id),s);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
