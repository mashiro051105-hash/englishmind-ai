import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { mockRespond, mockProvider, samples } from '../server/mock.js';
import { RequestSchema, ResponseSchema, DiagnosisSchema } from '../shared/contracts.js';
import type { AddressInfo } from 'node:net';
test('原五类预设诊断转换为统一分类及输出契约',()=>{for(const s of samples){const r=mockRespond({mode:'diagnosis',text:s.text});assert.equal(r.diagnosis?.issues[0].category,s.category);assert.ok(ResponseSchema.safeParse(r).success);assert.ok(r.assessed);}});
test('自由输入不制造诊断或母语迁移结论',()=>{const r=mockRespond({mode:'diagnosis',text:'My own sentence.'});assert.equal(r.assessed,false);assert.deepEqual(r.diagnosis?.issues,[]);assert.equal(r.diagnosis?.assessment,'unassessed');});
test('对话固定脚本明确标注无上下文',()=>{const r=mockRespond({mode:'conversation',text:'Hello'});assert.equal(r.assessed,false);assert.match(r.reply,/固定脚本/);assert.equal(r.diagnosis,null);});
test('正确表达不被强制纠错',()=>{const r=mockRespond({mode:'diagnosis',text:samples[4].text});assert.equal(r.nextAction,'finish');assert.equal(r.diagnosis?.issues[0].natural,samples[4].text);assert.equal(mockProvider.diagnose('I really enjoy hiking.','campus').target,null);});
test('无效输入和伪造响应被契约拒绝；反馈最多三个问题',()=>{
 for(const text of ['','  ','x'.repeat(2001)])assert.equal(RequestSchema.safeParse({mode:'diagnosis',text}).success,false);
 assert.equal(RequestSchema.safeParse({mode:'invalid',text:'hi'}).success,false);assert.equal(ResponseSchema.safeParse({provider:'invalid',reply:'fake'}).success,false);
 const diagnosis=mockProvider.diagnose(samples.slice(0,3).map(s=>s.text).join(' '),'campus').diagnosis;assert.equal(diagnosis.issues.length,3);
 assert.equal(mockProvider.diagnose(samples.slice(0,4).map(s=>s.text).join(' '),'campus').diagnosis.issues.length,3);
 assert.equal(DiagnosisSchema.safeParse({...diagnosis,issues:[...diagnosis.issues,diagnosis.issues[0]]}).success,false);
});
test('HTTP 单轮接口边界：健康、无效请求、JSON错误、大请求、未知API、真实模式拒绝',async()=>{
 for(const provider of ['mock','coze']){
  const server=createApp(provider).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try{const health=await(await fetch(`${url}/api/health`)).json();assert.equal(health.ready,provider==='mock');assert.equal(health.stage,3);
   const post=(body:string)=>fetch(`${url}/api/practice`,{method:'POST',headers:{'Content-Type':'application/json'},body});
   const valid=await post(JSON.stringify({mode:'diagnosis',text:samples[0].text}));assert.equal(valid.status,provider==='mock'?200:503);if(provider==='mock')assert.ok(ResponseSchema.safeParse(await valid.json()).success);
   assert.equal((await post(JSON.stringify({mode:'diagnosis',text:''}))).status,400);assert.equal((await post('{bad')).status,400);
   assert.equal((await post(JSON.stringify({mode:'diagnosis',text:'x'.repeat(20000)}))).status,413);assert.equal((await fetch(`${url}/api/missing`)).status,404);
   if(provider==='coze')assert.equal((await fetch(`${url}/api/training`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:randomUUID(),mode:'diagnosis',scenario:'campus'})})).status,503);
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
 }
});
