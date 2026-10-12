import { useCallback, useEffect, useRef, useState } from 'react';
import { type Session, type Command, type PracticeRecord } from '../shared/contracts';
import { ACTIVE_KEY, readActive } from './storage';
import { requestId } from './ids';
import { ensureBrowser, type BrowserAccess, ApiError, trainingRequest, type PendingCommand } from './api';
export function useTeaching(onRecord:(record:PracticeRecord)=>void,onRestore:(mode:'diagnosis'|'transfer')=>void){
 const [session,setSession]=useState<Session|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[pending,setPending]=useState<PendingCommand|null>(null),[resumeId,setResumeId]=useState<string|null>(null);
 const [access,setAccess]=useState<BrowserAccess|null>(null);
 const locked=useRef(false);const current=useRef<Session|null>(null);
 const accept=useCallback((value:Session)=>{current.current=value;setSession(value);setResumeId(value.id);if(value.record)onRecord(value.record);try{localStorage.setItem(ACTIVE_KEY,JSON.stringify({id:value.id,mode:value.mode}));}catch{setNotice('当前训练无法在本设备保存会话标识；刷新后需重新开始。');}},[onRecord]);
 useEffect(()=>{let active=true;
  (async()=>{let saved:ReturnType<typeof readActive>=null;
   try{try{saved=readActive(localStorage);}catch{if(active)setNotice('本地会话标识不可读；可在当前页面继续练习。');}const browser=await ensureBrowser();if(active)setAccess(browser);if(saved){if(active)setResumeId(saved.id);const value=await trainingRequest(`/${saved.id}`);if(active){accept(value);onRestore(saved.mode);}}}
   catch(e){if(active){const expired=e instanceof ApiError&&e.status===404;
    setNotice(saved&&!expired?'暂时无法恢复训练；会话标识已保留，可点击恢复状态重试。':e instanceof Error?e.message:'无法恢复训练。');
    if(!saved||expired){setResumeId(null);try{localStorage.removeItem(ACTIVE_KEY);}catch{/* 禁用存储时使用内存 */}}
   }}finally{if(active)setBusy(false);}
  })();
  return ()=>{active=false;};
 },[accept,onRestore]);
 const send=useCallback(async(operation:PendingCommand)=>{
  if(locked.current)return false;locked.current=true;setBusy(true);setError('');setPending(operation);
  try{const value=await trainingRequest(operation.path,operation.body);accept(value);setPending(null);return true;}
  catch(e){setError(e instanceof Error?e.message:'请求失败。');if(e instanceof ApiError&&(e.status===400||e.status===403||e.status===413||e.status===415||e.status===409||e.status===404||e.status===503))setPending(null);return false;}
  finally{locked.current=false;setBusy(false);}
 },[accept]);
 async function start(mode:'diagnosis'|'transfer',scenario:'campus'|'work',focus:'intensity'|'knowledge'|'request',intent=''){
  if(pending||(!current.current&&resumeId))return false;
  return send({path:'',body:{requestId:requestId(),mode,scenario,focus,intent}});
 }
 async function command(input:{type:'submit',text:string}|{type:'action',action:Extract<Command,{type:'action'}>['action']}|{type:'reset'}){
  if(!current.current||pending)return false;
  return send({path:`/${current.current.id}/commands`,body:{...input,revision:current.current.revision,requestId:requestId()}});
 }
 async function sync(){
  const id=current.current?.id??resumeId;if(!id||locked.current)return;locked.current=true;setBusy(true);setError('');
  try{const restored=await trainingRequest(`/${id}`);accept(restored);onRestore(restored.mode);setPending(null);setNotice('');}catch(e){setError(e instanceof Error?e.message:'同步失败。');if(e instanceof ApiError&&e.status===404){current.current=null;setSession(null);setResumeId(null);setPending(null);try{localStorage.removeItem(ACTIVE_KEY);}catch{setNotice('无法移除旧会话标识。');}}}finally{locked.current=false;setBusy(false);}
 }
 async function reset(){
  if(await command({type:'reset'})){current.current=null;setSession(null);setResumeId(null);try{localStorage.removeItem(ACTIVE_KEY);}catch{setNotice('无法清除旧会话标识，刷新时将恢复已停止的本轮。');}return true;}return false;
 }
 async function unlock(code:string){try{const response=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});const data=await response.json();if(!response.ok)throw new Error(data.error||'访问码无效。');setAccess(a=>a?{...a,authorized:true}:a);setError('');return true;}catch(e){setError(e instanceof Error?e.message:'解锁失败。');return false;}}
 async function cancel(){if(!pending||!current.current)return;try{const response=await fetch(`/api/training/${current.current.id}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:pending.body.requestId})});const data=await response.json();if(!response.ok||!data.cancelled)setNotice('当前操作已完成或尚未进入处理，取消未生效，请等待后同步。');}catch{setError('取消请求未送达；请等待超时后同步状态。');}}
 function forgetCompleted(){if(current.current?.phase!=='completed')return;current.current=null;setSession(null);setResumeId(null);setPending(null);try{localStorage.removeItem(ACTIVE_KEY);}catch{setNotice('浏览器拒绝移除已结束会话标识，刷新后记录可能恢复。');}}
 function dismissNotice(){setNotice('');}
 return {forgetCompleted,session,access,unlock,cancel,recoverable:!!resumeId&&!session,busy,error,notice,pending,start,command,sync,reset,dismissNotice,retryPending:()=>pending?send(pending):Promise.resolve(false)};
}
