import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
export interface SecurityOptions{production?:boolean;publicOrigin?:string;sessionSecret?:string;accessCode?:string;paidEnabled?:boolean;rateLimit?:number;ownerLimit?:number;trustProxy?:number;}
export function securityOptions(env:NodeJS.ProcessEnv=process.env):SecurityOptions{return {production:env.NODE_ENV==='production',publicOrigin:env.PUBLIC_ORIGIN||env.RENDER_EXTERNAL_URL,sessionSecret:env.SESSION_COOKIE_SECRET,accessCode:env.AI_ACCESS_CODE,paidEnabled:env.ENABLE_PAID_AI==='1',rateLimit:Number(env.API_RATE_LIMIT||120),ownerLimit:Number(env.API_OWNER_LIMIT||100),trustProxy:Number(env.TRUST_PROXY_HOPS||0)};}
function equals(a:string,b:string){const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();return timingSafeEqual(x,y);}
export class ApiSecurity{
 private secret:string;private buckets=new Map<string,{count:number,expires:number}>();private owners=new Map<string,{owner:string,seen:number}>();
 constructor(readonly options:SecurityOptions,private now=()=>Date.now()) {this.secret=options.sessionSecret||randomBytes(32).toString('hex');}
 setupError(provider:string){
  if(this.options.production&&process.env.APP_INSTANCES&&process.env.APP_INSTANCES!=='1')return '内存会话仅支持一个常驻实例。';
  const o=this.options;let validOrigin=false;try{const url=new URL(o.publicOrigin||'');validOrigin=url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/';}catch{}if(!Number.isInteger(o.rateLimit??120)||(o.rateLimit??120)<1||!Number.isInteger(o.ownerLimit??100)||(o.ownerLimit??100)<1||!Number.isInteger(o.trustProxy??0)||(o.trustProxy??0)<0||(o.trustProxy??0)>1)return '请求限速或代理配置无效。';
  if(o.production&&((o.sessionSecret?.length??0)<32||!validOrigin))return '生产环境需HTTPS PUBLIC_ORIGIN及至少32字符SESSION_COOKIE_SECRET。';
  if(provider==='openai'&&o.paidEnabled&&(o.accessCode?.length??0)<16)return '启用收费AI需配置至少16字符的AI_ACCESS_CODE。';return null;
 }
 private cookie(res:Response,id:string,paid:boolean){const payload=Buffer.from(JSON.stringify({id,paid,exp:this.now()+86400000})).toString('base64url');const sig=createHmac('sha256',this.secret).update(payload).digest('hex');res.cookie('englishmind_browser',payload+'.'+sig,{httpOnly:true,sameSite:'strict',secure:!!this.options.production,maxAge:86400000,path:'/'});}
 identity(req:Request,res:Response){
  const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('englishmind_browser='))?.slice(20);let identity:{id:string;paid:boolean;exp:number}|null=null;
  if(raw&&raw.length<600){const [payload,sig]=raw.split('.');if(payload&&sig&&equals(createHmac('sha256',this.secret).update(payload).digest('hex'),sig))try{const d=JSON.parse(Buffer.from(payload,'base64url').toString());if(typeof d.id==='string'&&/^[a-f0-9]{64}$/.test(d.id)&&typeof d.paid==='boolean'&&Number.isFinite(d.exp)&&d.exp>this.now())identity=d;}catch{}}
  if(!identity){identity={id:randomBytes(32).toString('hex'),paid:false,exp:this.now()+86400000};this.cookie(res,identity.id,false);}
  res.locals.browser=identity;return identity;
 }
 headers(_req:Request,res:Response,next:NextFunction){res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(), camera=()'});if(this.options.production)res.set({'Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"});next();}
 guard(req:Request,res:Response,next:NextFunction){
  res.set('Cache-Control','no-store');
  const origin=req.get('Origin');if(origin){const expected=(this.options.publicOrigin?new URL(this.options.publicOrigin).origin:null)||`${req.protocol}://${req.get('host')}`;if(origin!==expected)return res.status(403).json({error:'仅允许同源应用访问。'});}
  if(!['GET','HEAD'].includes(req.method)&&!req.is('application/json'))return res.status(415).json({error:'仅接受JSON请求。'});
  for(const [k,b]of this.buckets)if(b.expires<=this.now())this.buckets.delete(k);
  const ip=req.ip||'unknown';const keys=[`ip:${ip}`];if(res.locals.browser)keys.push(`owner:${res.locals.browser.id}`);
  for(const key of keys){const max=key.startsWith('ip:')?this.options.rateLimit??120:this.options.ownerLimit??100;const old=this.buckets.get(key);if(!old&&this.buckets.size>=10000)return res.status(503).json({error:'演示请求容量已满。'});const b=old??{count:0,expires:this.now()+60000};b.count++;this.buckets.set(key,b);if(b.count>max){res.set('Retry-After',String(Math.max(1,Math.ceil((b.expires-this.now())/1000))));return res.status(429).json({error:'请求过于频繁，请稍后重试。'});}}
  next();
 }
 access(req:Request,res:Response){const code=req.body?.code;if(typeof code!=='string'||code.length>256||!this.options.accessCode||!equals(code,this.options.accessCode))return res.status(403).json({error:'访问码无效。'});this.cookie(res,res.locals.browser.id,true);res.json({authorized:true});}
 requirePaid(res:Response){if(!this.options.paidEnabled)return '收费AI入口未启用，不会产生模型请求。';if(!res.locals.browser?.paid)return '请输入演示访问码后再使用AI。';return null;}
 bind(id:string,owner:string){for(const [key,v]of this.owners)if(this.now()-v.seen>86400000)this.owners.delete(key);this.owners.set(id,{owner,seen:this.now()});}
 owns(id:string,owner:string){const found=this.owners.get(id);if(!found||found.owner!==owner)return false;found.seen=this.now();return true;}
 startKey(owner:string,key:string){const hex=createHash('sha256').update(owner+key).digest('hex').slice(0,32);return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;}
}
