import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import { OpenAIProvider } from '../server/openai-provider.js';
import { TeachingStore } from '../server/teaching.js';
import { createApp } from '../server/app.js';
import { SessionSchema } from '../shared/contracts.js';
import type { AddressInfo } from 'node:net';
test('官方SDK模拟传输贯通真实Provider HTTP诊断→动态训练→等效评价→动态迁移→结束',async()=>{
 const calls:string[]=[];
 const client=new OpenAI({apiKey:'test-only-placeholder',maxRetries:0,fetch:async(_url,init)=>{
  const req=JSON.parse(init?.body as string),name=req.text.format.name,data=JSON.parse(req.input);calls.push(name);
  let out:unknown;
  if(name==='english_diagnosis')out={assessment:'assessed',issues:[{category:'collocation',explanation:'gain knowledge是常见搭配',natural:'I want to gain more knowledge.',chunks:['gain knowledge']}],goal:{chunk:'gain knowledge',meaning:'增加特定主题知识',equivalents:['learn about']}};
  else if(name==='english_task'){const transfer=data.kind==='transfer';out={prompt:transfer?'在社区烹饪课堂上，向老师说明你希望增加烹饪知识。':'参加天文学社团面试，说明你希望增加天文学知识。',meaning:transfer?'说明希望学习烹饪知识':'说明希望学习天文学知识',reference:transfer?'I hope to learn more about cooking.':'I want to gain knowledge about astronomy.',hint:'可以用表示了解某主题的搭配。',contextId:transfer?'社区烹饪课堂':'天文社团面试'};}
  else out={verdict:'success',meaningCorrect:true,naturalAndAppropriate:true,targetOrEquivalentUsed:true,reason:'意思与语境一致，等效词框架自然',assessment:'assessed',issues:[{category:'no_issue',explanation:'表达自然且符合当前交际目标',natural:data.text,chunks:[]}]};
  return new Response(JSON.stringify({id:'resp_fixture',object:'response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(out),annotations:[]}]}]}),{headers:{'Content-Type':'application/json'}});
 }});
 const provider=new OpenAIProvider({apiKey:'test-only-placeholder',model:'fixture-only',timeoutMs:1000,maxOutputTokens:1800,maxCallsPerMinute:20,maxTotalCalls:20},client),store=new TeachingStore(provider);
 const server=createApp('openai',store,provider).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const post=async(path:string,body:unknown)=>{const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(res.status,200);return SessionSchema.parse(await res.json());};
 try{
  let s=await post('/api/training',{requestId:randomUUID(),mode:'diagnosis',scenario:'campus',intent:'说明自己的学习目标'});const id=s.id;
  const submit=async(text:string)=>{s=await post(`/api/training/${id}/commands`,{requestId:randomUUID(),revision:s.revision,type:'submit',text});};
  const action=async(action:string)=>{s=await post(`/api/training/${id}/commands`,{requestId:randomUUID(),revision:s.revision,type:'action',action});};
  await submit('I want to learn more knowledge.');assert.equal(s.provider,'openai');assert.equal(s.record?.target,'gain knowledge');await action('practice');assert.equal(s.feedback,null);assert.equal(s.record,null);assert.match(s.task.prompt,/天文学/);
  await submit('I would love to learn about astronomy.');await action('transfer');assert.match(s.task.prompt,/烹饪/);assert.doesNotMatch(JSON.stringify(s),/reference|chunks|gain knowledge|learn about/);
  await submit('I would love to understand cooking better.');const assessed=store.view(id);assert.equal(assessed.feedback?.outcome,'first_independent_success');await action('finish');const record=store.view(id).record!;assert.equal(record.provider,'openai');assert.equal(record.attempts.length,3);assert.deepEqual(record.transferResults,['first_independent_success']);assert.deepEqual(calls,['english_diagnosis','english_task','english_evaluation','english_task','english_evaluation']);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
