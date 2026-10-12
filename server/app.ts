import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiSecurity, securityOptions, type SecurityOptions } from './security.js';
import { StartSchema, RequestSchema, ResponseSchema } from '../shared/contracts.js';
import { configuredProvider } from './config.js';
import { ProviderError, type TeachingProvider } from './provider.js';
import { mockRespond } from './mock.js';
import { TeachingStore, TeachingError } from './teaching.js';
import { z, ZodError } from 'zod';
const ZodRequestId=z.string().uuid();
export function createApp(provider = 'mock', suppliedStore?:TeachingStore, suppliedProvider?:TeachingProvider, options:SecurityOptions=securityOptions()) {
  const config=suppliedProvider?{name:provider,provider:suppliedProvider,error:null}:configuredProvider({...process.env,AI_PROVIDER:provider});
  const operationTimeout=provider==='ollama'?125000:35000;
  const store=suppliedStore??new TeachingStore(config.provider??undefined,undefined,undefined,undefined,{operationTimeoutMs:operationTimeout,maxCallsPerSession:30});
  const adapter=config.provider;
  const security=new ApiSecurity(options);const setupError=security.setupError(provider);
  const app = express();
  app.set('trust proxy',options.trustProxy??0);
  app.use(security.headers.bind(security));
  app.disable('x-powered-by');
  app.use(express.json({limit:'16kb'}));
  app.get('/api/health', (_req,res) => res.json({provider,ready:!!adapter&&!setupError,stage:5,paidEnabled:!!options.paidEnabled,accessRequired:provider==='openai',notice:setupError??config.error??(provider==='mock'?'有限规则Mock，无外部AI调用。':'独立AI模式已配置；此检查不代表在线请求已验证。')}));
  app.get('/api/ready',(_req,res)=>res.status(adapter&&!setupError?200:503).json({ready:!!adapter&&!setupError}));
  app.use('/api', (req,res,next)=>{security.identity(req,res);security.guard(req,res,next);});
  app.get('/api/bootstrap',(_req,res)=>res.json({paidEnabled:!!options.paidEnabled,authorized:!!res.locals.browser.paid,accessRequired:provider==='openai'}));
  app.post('/api/access', (req,res)=>security.access(req,res));
  app.use('/api',(_req,res,next)=>{if(setupError)return res.status(503).json({error:setupError});next();});
  app.use('/api/training', (_req,res,next)=>{if(!adapter)return res.status(503).json({error:config.error,code:'configuration'});next();});
  app.use(['/api/practice','/api/training'],(_req,res,next)=>{if(provider==='openai'&&adapter){const error=security.requirePaid(res);if(error)return res.status(403).json({error});}next();});
  app.post('/api/practice', async (req,res,next) => {
    const parsed=RequestSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'请输入1–2000字符，并选择有效模式和场景。'});
    try{
      if(!adapter)return res.status(503).json({error:config.error,code:'configuration'});
      if(provider==='mock')return res.json(ResponseSchema.parse(mockRespond(parsed.data)));
      const ctx={signal:AbortSignal.timeout(operationTimeout),consume:()=>{}};
      if(parsed.data.mode==='conversation'){
        if(!adapter?.converse)throw new ProviderError(503,'unsupported','当前Provider不支持对话。');
        const reply=await adapter.converse(parsed.data.text,parsed.data.scenario,ctx);
        return res.json(ResponseSchema.parse({provider,reply,diagnosis:null,nextAction:'finish',assessed:false}));
      }
      const result=await adapter!.diagnose(parsed.data.text,parsed.data.scenario,ctx);
      return res.json(ResponseSchema.parse({provider,reply:'独立AI诊断，请结合具体语境理解。',diagnosis:result.diagnosis,nextAction:result.diagnosis.nextAction,assessed:result.diagnosis.assessment==='assessed'}));
    }catch(e){next(e);}
  });
  app.post('/api/training', async (req,res,next) => {try {const input=StartSchema.parse(req.body);const owner=res.locals.browser.id;const view=await store.start({...input,requestId:security.startKey(owner,input.requestId)});security.bind(view.id,owner);res.json(view);}catch(e){next(e);}});
  app.use('/api/training/:id',(req,res,next)=>{if(!security.owns(req.params.id,res.locals.browser.id))return res.status(404).json({error:'训练会话已失效或不属于当前浏览器。已保存本地档案保留，请重新开始。'});next();});
  app.post('/api/training/:id/cancel',(req,res,next)=>{try{const requestId=ZodRequestId.parse(req.body?.requestId);res.json({cancelled:store.cancel(req.params.id,requestId)});}catch(e){next(e);}});
  app.get('/api/training/:id', (req,res,next) => {try {res.json(store.view(req.params.id));}catch(e){next(e);}});
  app.post('/api/training/:id/commands', async (req,res,next) => {try {res.json(await store.command(req.params.id,req.body));}catch(e){next(e);}});
  app.use('/api', (_req,res) => res.status(404).json({error:'API 不存在。'}));
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist));
  app.get('/{*path}', (_req,res) => res.sendFile(path.join(dist,'index.html')));
  app.use((error: {type?:string;status?:number}, _req:express.Request, res:express.Response, _next:express.NextFunction) => {
    if(error instanceof ProviderError)return res.status(error.status).json({error:error.message,code:error.code});
    if(error instanceof TeachingError) return res.status(error.status).json({error:error.message});
    if(error instanceof ZodError) return res.status(400).json({error:'请求参数无效：检查状态版本、请求标识及非空输入（最多2000字符）。'});
    res.status(error.status === 413 ? 413 : error.type === 'entity.parse.failed' ? 400 : 500).json({error:error.status === 413 ? '请求过大。' : error.type === 'entity.parse.failed' ? '请求 JSON 格式无效。' : '服务暂时不可用。'});
  });
  return app;
}
