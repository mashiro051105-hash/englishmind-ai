import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { TeachingStore } from '../server/teaching.js';
import { ACTIVE_KEY, LEGACY_KEY, STORAGE_KEY, appendRecord, decodeRecords, loadRecords, readActive, writeRecords, type StorageLike } from '../src/storage.js';
class MemoryStorage implements StorageLike{data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}}
async function record(){const store=new TeachingStore();const s=await store.start({requestId:randomUUID(),mode:'diagnosis',scenario:'campus'});return (await store.command(s.id,{requestId:randomUUID(),revision:0,type:'submit',text:'I very like English.'})).record!;}
test('本地记录刷新还原、会话标识还原、损坏数据拒绝且不覆盖',async()=>{
 const storage=new MemoryStorage(),r=await record();assert.ok(writeRecords(storage,[r]));assert.deepEqual(loadRecords(storage).records,[r]);storage.setItem(ACTIVE_KEY,JSON.stringify({id:r.id,mode:'diagnosis'}));assert.equal(readActive(storage)?.id,r.id);
 storage.setItem(STORAGE_KEY,'{bad');assert.equal(loadRecords(storage).writable,false);assert.equal(storage.getItem(STORAGE_KEY),'{bad');assert.throws(()=>decodeRecords('[{"id":"invalid"}]'));storage.setItem(ACTIVE_KEY,'{}');assert.throws(()=>readActive(storage));
});
test('同轮档案按ID更新不重复，保留最近100轮',async()=>{const r=await record();assert.equal(appendRecord([r],{...r,status:'completed'}).length,1);assert.equal(appendRecord([r],{...r,status:'completed'})[0].status,'completed');assert.equal(appendRecord(Array.from({length:100},(_,i)=>({...r,id:String(i)})),r).length,100);});
test('第一阶段格式迁移，不捏造目标、提示或检索成功，保留原数据',async()=>{
 const storage=new MemoryStorage();const raw=JSON.stringify([{id:'legacy',mode:'transfer',text:'I very like English.',createdAt:new Date().toISOString(),status:'demo-reviewed',response:{provider:'mock',diagnosis:{category:'grammar',chunks:['really like']}}}]);storage.setItem(LEGACY_KEY,raw);const loaded=loadRecords(storage);assert.ok(loaded.writable);assert.equal(loaded.records[0].status,'legacy');assert.equal(loaded.records[0].target,null);assert.deepEqual(loaded.records[0].transferResults,[]);assert.deepEqual(loaded.records[0].attempts,[]);assert.equal(storage.getItem(LEGACY_KEY),raw);assert.deepEqual(loadRecords(storage).records,loaded.records);
});
test('存储禁用、配额失败、旧格式不兼容均明确处理',async()=>{
 const broken:StorageLike={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');},removeItem(){throw Error('disabled');}};assert.equal(loadRecords(broken).writable,false);assert.equal(writeRecords(broken,[await record()]),false);
 const old=new MemoryStorage();old.setItem(LEGACY_KEY,'[{"old":true}]');assert.equal(loadRecords(old).writable,false);assert.equal(old.getItem(STORAGE_KEY),null);
 const full=new MemoryStorage();full.setItem(LEGACY_KEY,JSON.stringify([{id:'old',mode:'diagnosis',text:'unknown',createdAt:new Date().toISOString(),status:'unassessed',response:{diagnosis:null}}]));full.setItem=()=>{throw Error('quota');};const result=loadRecords(full);assert.equal(result.records.length,1);assert.equal(result.writable,false);
});
test('局域网HTTP没有randomUUID方法时仍可生成有效唯一请求键',async()=>{
 const {requestId}=await import('../src/ids.js');const {z}=await import('zod');const source={getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto)};const a=requestId(source),b=requestId(source);assert.ok(z.string().uuid().safeParse(a).success);assert.notEqual(a,b);
});
