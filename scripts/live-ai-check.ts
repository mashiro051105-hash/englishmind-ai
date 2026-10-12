import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configuredProvider } from '../server/config.js';
import { TeachingStore } from '../server/teaching.js';
if(process.env.RUN_LIVE_AI!=='1'){console.log('SKIP online AI test: set RUN_LIVE_AI=1 explicitly (may incur fees).');process.exit(0);}
const cfg=configuredProvider({...process.env,AI_PROVIDER:'openai'});if(!cfg.provider)throw Error(cfg.error??'AI configuration required');
const store=new TeachingStore(cfg.provider);let s=await store.start({requestId:randomUUID(),mode:'diagnosis',scenario:'campus',intent:'表示喜欢英语'});
s=await store.command(s.id,{requestId:randomUUID(),revision:0,type:'submit',text:'I very like English.'});assert.equal(s.provider,'openai');assert.equal(s.phase,'feedback');
if(s.allowedActions.includes('practice')){s=await store.command(s.id,{requestId:randomUUID(),revision:s.revision,type:'action',action:'practice'});assert.equal(s.feedback,null);assert.equal(s.record,null);assert.doesNotMatch(s.task.prompt,/[a-zA-Z]/);}
console.log('PASS online diagnostic and optional generated task (at most 2 calls). Complete semantic quality/transfer verification manually in the app.');
