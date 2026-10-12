import { z } from 'zod';
import { RecordSchema, type PracticeRecord } from '../shared/contracts';
export const STORAGE_KEY='englishmind.practice.v2';
export const LEGACY_KEY='englishmind.practice.v1';
export const ACTIVE_KEY='englishmind.session.v2';
export const ActiveSchema=z.object({id:z.string().uuid(),mode:z.enum(['diagnosis','transfer'])}).strict();
export function decodeRecords(raw:string|null):PracticeRecord[]{if(!raw)return [];return z.array(RecordSchema).max(100).parse(JSON.parse(raw));}
export function appendRecord(records:PracticeRecord[],record:PracticeRecord){return [record,...records.filter(r=>r.id!==record.id)].slice(0,100);}
const LegacySchema=z.array(z.object({id:z.string(),mode:z.enum(['conversation','diagnosis','transfer']),text:z.string(),createdAt:z.string().datetime(),status:z.enum(['demo-reviewed','unassessed']),response:z.object({diagnosis:z.object({category:z.string(),chunks:z.array(z.string())}).nullable()}).passthrough()})).max(100);
const legacyCategories:Record<string,PracticeRecord['diagnosisTypes'][number]>={grammar:'grammar',collocation:'collocation',context:'contextual_mismatch',optimization:'acceptable_but_improvable',correct:'no_issue'};
export function migrateLegacy(raw:string):PracticeRecord[]{return LegacySchema.parse(JSON.parse(raw)).map(r=>({version:2,provider:'mock',id:`legacy-${r.id}`,mode:r.mode,createdAt:r.createdAt,updatedAt:r.createdAt,status:'legacy',target:null,diagnosisTypes:r.response.diagnosis&&legacyCategories[r.response.diagnosis.category]?[legacyCategories[r.response.diagnosis.category]]:[],transferResults:[],hintCount:0,retryCount:0,attempts:[],legacyText:r.text}));}
export interface StorageLike{getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;}
export function loadRecords(storage:StorageLike):{records:PracticeRecord[],notice:string,writable:boolean}{
 try{
  const current=storage.getItem(STORAGE_KEY);if(current!==null)return {records:decodeRecords(current),notice:'',writable:true};
  const legacy=storage.getItem(LEGACY_KEY);if(!legacy)return {records:[],notice:'',writable:true};
  const records=migrateLegacy(legacy);
  try{storage.setItem(STORAGE_KEY,JSON.stringify(records));return {records,notice:'第一阶段记录已迁移为历史演示记录，不计为迁移检验成功。原数据保留。',writable:true};}
  catch{return {records,notice:'历史记录已读取，但本地存储不可写；本次更改仅保留在页面内。',writable:false};}
 }catch{return {records:[],notice:'本地存储不可用或记录格式不兼容。旧数据未覆盖；清空记录后可重试。',writable:false};}
}
export function writeRecords(storage:StorageLike,records:PracticeRecord[]):boolean{try{storage.setItem(STORAGE_KEY,JSON.stringify(records));return true;}catch{return false;}}
export function readActive(storage:StorageLike){const raw=storage.getItem(ACTIVE_KEY);return raw?ActiveSchema.parse(JSON.parse(raw)):null;}
