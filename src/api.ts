import { SessionSchema, type Session, type Command } from '../shared/contracts';
export class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
export async function trainingRequest(path:string,body?:unknown):Promise<Session>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
 try{
  const result=await fetch(`/api/training${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:controller.signal});
  let data;try{data=await result.json();}catch{throw new ApiError(result.status,'服务返回异常，请检查连接后同步状态或重试。');}if(!result.ok)throw new ApiError(result.status,typeof data.error==='string'?data.error:'训练请求失败。');
  const parsed=SessionSchema.safeParse(data);if(!parsed.success)throw new Error('训练响应格式无效。');return parsed.data;
 }catch(e){if(e instanceof Error&&e.name==='AbortError')throw new Error('请求超时；请同步状态或重试同一请求，避免重复计数。');throw e;}finally{clearTimeout(timer);}
}
export type PendingCommand={path:string,body:Command|{requestId:string,mode:'diagnosis'|'transfer',scenario:'campus'|'work',focus:'intensity'|'knowledge'|'request',intent?:string}};
