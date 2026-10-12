import { z } from 'zod';
import { OpenAIProvider, type StructuredTransport } from './openai-provider.js';
import type { RequestTelemetry } from './telemetry.js';
import { ProviderError } from './provider.js';
export interface OllamaConfig{baseUrl:string;model:string;timeoutMs:number;numCtx:number;maxOutputTokens:number;maxCallsPerMinute:number;maxTotalCalls:number;onTelemetry?:(event:RequestTelemetry)=>void;}
const Envelope=z.object({done:z.literal(true),done_reason:z.string().optional(),message:z.object({content:z.string().max(16000)}),prompt_eval_count:z.number().int().nonnegative().optional(),eval_count:z.number().int().nonnegative().optional()});
export function localEndpoint(base:string){
 let url:URL;try{url=new URL(base);}catch{throw new ProviderError(503,'configuration','OLLAMA_BASE_URL不是有效地址。');}
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new ProviderError(503,'local_only','Ollama接口仅允许本机HTTP回环地址，不允许云端、凭证或代理路径。');
 return new URL('/api/chat',url).href;
}
export function ollamaTransport(config:OllamaConfig,fetcher:typeof fetch=fetch):StructuredTransport{
 const endpoint=localEndpoint(config.baseUrl);
 return async request=>{
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(config.timeoutMs)]);
  try{
   const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal,body:JSON.stringify({model:request.model,stream:false,think:false,format:request.schema,messages:[{role:'system',content:request.instructions},{role:'user',content:request.input}],options:{temperature:0,num_ctx:config.numCtx,num_predict:request.maxOutputTokens},keep_alive:'5m'})});
   if(!response.ok)throw new ProviderError(response.status===404?503:502,response.status===404?'local_model_missing':'local_service','本地Ollama服务或模型不可用；请确认服务启动并已手动下载指定模型。未回退Mock。');
   if(!response.body)throw new ProviderError(502,'invalid_json','本地模型响应为空。');
   const reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
   for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536){await reader.cancel();throw new ProviderError(502,'output_limit','本地模型响应过长，已拒绝。');}chunks.push(value);}
   let json:unknown;try{json=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ProviderError(502,'invalid_json','本地服务返回无效JSON，状态未修改。');}
   const checked=Envelope.safeParse(json);if(!checked.success)throw new ProviderError(502,'invalid_schema','本地模型响应结构无效或未完成，状态未修改。');
   const data=checked.data;if(data.done_reason==='length')throw new ProviderError(502,'incomplete','本地模型输出达到上限，请缩短输入或调整输出预算。');
   // Convert only the protocol envelope. Model content still passes the identical Zod and teaching checks.
   return {status:'completed',output_text:data.message.content,usage:data.prompt_eval_count!==undefined&&data.eval_count!==undefined?{input_tokens:data.prompt_eval_count,output_tokens:data.eval_count}:undefined};
  }catch(e){if(e instanceof ProviderError)throw e;if(signal.aborted)throw new ProviderError(request.signal.aborted?409:504,request.signal.aborted?'cancelled':'timeout','本地推理已取消或超时，状态未修改；可同步后重试。');throw new ProviderError(503,'local_connection','无法连接本机Ollama，请启动服务并检查11434端口。');}
 };
}
// Reuse the structured diagnosis/generation/evaluation/summary logic, not the paid network transport.
export class OllamaProvider extends OpenAIProvider{
 override readonly id='ollama' as const;
 override async verifyModelAccess(){throw new ProviderError(400,'local_preflight','本地模型请用ollama list核查；不调用OpenAI权限接口。');}
 constructor(config:OllamaConfig,fetcher?:typeof fetch){
  if(!config.model.trim()||/cloud/i.test(config.model))throw new ProviderError(503,'configuration','请配置已手动下载的本地OLLAMA_MODEL；不允许cloud模型。');
  super({...config,apiKey:''},undefined,ollamaTransport(config,fetcher));
 }
}
