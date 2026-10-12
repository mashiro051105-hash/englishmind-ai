import type { RequestTelemetry } from './telemetry.js';
import { z } from 'zod';
import { OpenAIProvider } from './openai-provider.js';
import { ProviderError, type TeachingProvider } from './provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { mockProvider } from './mock.js';
export function configuredProvider(env:NodeJS.ProcessEnv=process.env,onTelemetry?:(event:RequestTelemetry)=>void):{name:string;provider:TeachingProvider|null;error:string|null}{
 const name=env.AI_PROVIDER||'mock';if(name==='mock')return {name,provider:mockProvider,error:null};
 if(name!=='openai'&&name!=='ollama')return {name,provider:null,error:'未知或尚未实现的Provider；Coze仅作为独立对照智能体。'};
 try{
  const integer=(key:string,defaultValue:number,min:number,max:number)=>z.coerce.number().int().min(min).max(max).parse(env[key]||defaultValue);
  if(name==='ollama'){if(env.NODE_ENV==='production')throw new ProviderError(503,'local_only','Ollama只用于本机开发；公开生产演示请使用Mock。');return {name,provider:new OllamaProvider({baseUrl:env.OLLAMA_BASE_URL||'http://127.0.0.1:11434',model:env.OLLAMA_MODEL||'',timeoutMs:integer('OLLAMA_TIMEOUT_MS',90000,100,120000),numCtx:integer('OLLAMA_NUM_CTX',4096,2048,8192),maxOutputTokens:integer('AI_MAX_OUTPUT_TOKENS',1800,300,4000),maxCallsPerMinute:integer('AI_MAX_CALLS_PER_MINUTE',20,1,120),maxTotalCalls:integer('AI_MAX_TOTAL_CALLS',12,1,10000),onTelemetry}),error:null};}
  const provider=new OpenAIProvider({apiKey:env.OPENAI_API_KEY||'',model:env.OPENAI_MODEL||'',timeoutMs:integer('AI_TIMEOUT_MS',20000,100,30000),maxOutputTokens:integer('AI_MAX_OUTPUT_TOKENS',1800,300,4000),maxCallsPerMinute:integer('AI_MAX_CALLS_PER_MINUTE',20,1,120),maxTotalCalls:integer('AI_MAX_TOTAL_CALLS',12,1,10000)});
  return {name,provider,error:null};
 }catch(e){return {name,provider:null,error:e instanceof ProviderError?e.message:'AI环境变量格式不正确，请检查数值范围。'};}
}
