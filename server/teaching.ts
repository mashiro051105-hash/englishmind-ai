import { randomUUID } from 'node:crypto';
import { CommandSchema, RecordSchema, SessionSchema, StartSchema, type Command, type Feedback, type PracticeRecord, type Session, type Task, type Outcome } from '../shared/contracts.js';
import { mockProvider, normalize } from './mock.js';
import { DiagnosticResultSchema, EvaluationSchema, ProviderError, type TeachingProvider, type TeachingTarget, type CallContext } from './provider.js';
import { GeneratedTaskSchema } from './ai-schemas.js';
import { publicTask, taskFor, type TaskSpec } from './tasks.js';
import { assertTaskSafety, goalFor } from './task-safety.js';
export class TeachingError extends Error {constructor(public status:number,message:string){super(message);}}
interface Internal {
 id:string;mode:'diagnosis'|'transfer';scenario:'campus'|'work';intent:string;phase:Session['phase'];revision:number;
 task:TaskSpec|Task;target:TeachingTarget|null;feedback:Feedback|null;hint:string|null;
 taskAttempts:number;taskHints:number;retryOrdinal:number;index:number;
 record:PracticeRecord;seenAnswers:string[];previousPrompts:string[];contextIds:string[];commands:Map<string,{fingerprint:string}>;lastSeen:number;
}
function isSpec(task:Task|TaskSpec):task is TaskSpec {return 'reference' in task;}
export function chooseDecision(outcome:Outcome,kind:Task['kind'],attempts:number):Feedback['decision'] {
 if(['first_independent_success','hinted_success','retry_success'].includes(outcome))return kind==='transfer'?'finish':'transfer';
 if(outcome==='partial')return attempts>=3?'finish':'hint';
 if(outcome==='unassessed')return 'retry';
 return attempts>=2?'finish':'lower';
}
interface Reservation{fingerprint:string;id:string;lastSeen:number;}
interface Flight{requestId:string;fingerprint:string;promise:Promise<Session>;}
export class TeachingStore {
 private sessions=new Map<string,Internal>();private controllers=new Map<string,AbortController>();
 private starts=new Map<string,Reservation>();private startFlights=new Map<string,Promise<Session>>();
 private flights=new Map<string,Flight>();private fingerprints=new Map<string,Map<string,string>>();private callCounts=new Map<string,number>();
 constructor(private provider:TeachingProvider=mockProvider,private now=()=>Date.now(),private ttl=24*60*60*1000,private capacity=500,private limits={operationTimeoutMs:35000,maxCallsPerSession:30}){}
 private prune(){
  for(const [id,s]of this.sessions)if(!this.flights.has(id)&&this.now()-s.lastSeen>this.ttl){this.sessions.delete(id);this.fingerprints.delete(id);this.callCounts.delete(id);}
  for(const [key,s]of this.starts)if(!this.startFlights.has(key)&&this.now()-s.lastSeen>this.ttl){this.starts.delete(key);if(!this.sessions.has(s.id))this.callCounts.delete(s.id);}
 }
 private get(id:string){this.prune();const s=this.sessions.get(id);if(!s)throw new TeachingError(404,'训练会话已失效（服务重启或闲置超过24小时）。已保存记录保留，请重新开始。');s.lastSeen=this.now();return s;}
 private async controlled<T>(id:string,work:(ctx:CallContext)=>Promise<T>):Promise<T>{
  const controller=new AbortController();this.controllers.set(id,controller);let timedOut=false;let timer:ReturnType<typeof setTimeout>;
  const timeout=new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(new ProviderError(504,'timeout','AI操作超时，状态未修改；可重试同一请求。'));},this.limits.operationTimeoutMs);});
  const cancelled=new Promise<never>((_r,reject)=>controller.signal.addEventListener('abort',()=>reject(new ProviderError(timedOut?504:409,timedOut?'timeout':'cancelled',timedOut?'AI操作超时，状态未修改。':'操作已取消，状态未修改；可以同步或重试。')),{once:true}));
  const ctx:CallContext={signal:controller.signal,consume:()=>{if(controller.signal.aborted)throw new ProviderError(504,'timeout','请求已超时。');const n=this.callCounts.get(id)??0;if(n>=this.limits.maxCallsPerSession)throw new ProviderError(429,'session_limit','本轮AI调用次数达到上限，请结束本轮。');this.callCounts.set(id,n+1);}};
  try{return await Promise.race([work(ctx),timeout,cancelled]);}finally{clearTimeout(timer!);if(this.controllers.get(id)===controller)this.controllers.delete(id);controller.abort();}
 }
 cancel(id:string,requestId:string){this.get(id);const flight=this.flights.get(id);if(!flight||flight.requestId!==requestId)return false;this.controllers.get(id)?.abort();return true;}
 view(id:string):Session {return this.project(this.get(id));}
 private project(s:Internal):Session {
  const awaiting=s.phase==='awaiting';
  const actions=awaiting?(isSpec(s.task)&&!s.hint?['hint','finish'] as const:['finish'] as const):s.phase==='completed'?[]:this.actions(s);
  return SessionSchema.parse({id:s.id,provider:this.provider.id??'mock',revision:s.revision,mode:s.mode,phase:s.phase,task:publicTask(s.task),feedback:awaiting?null:s.feedback,hint:s.hint,allowedActions:actions,record:awaiting?null:s.record});
 }
 private actions(s:Internal):Feedback['decision'][] {
  if(!s.target)return ['finish'];const d=s.feedback!.decision;
  if(d==='practice')return ['practice','finish'];if(d==='transfer')return ['transfer','finish'];
  if(d==='finish')return s.feedback?.outcome&&['first_independent_success','hinted_success','retry_success'].includes(s.feedback.outcome)&&s.index<2?['finish','challenge']:['finish'];
  return d==='hint'?['hint','retry','finish']:d==='lower'?['lower','retry','finish']:['retry','finish'];
 }
 async start(raw:unknown):Promise<Session>{
  const input=StartSchema.parse(raw);this.prune();const fingerprint=JSON.stringify({...input,requestId:undefined});let reservation=this.starts.get(input.requestId);
  if(reservation){if(reservation.fingerprint!==fingerprint)throw new TeachingError(409,'同一个请求键不能用于不同的开始参数。');const flight=this.startFlights.get(input.requestId);if(flight)return flight;if(this.sessions.has(reservation.id))return this.view(reservation.id);}
  else{if(this.starts.size>=this.capacity||this.sessions.size+this.startFlights.size>=this.capacity)throw new TeachingError(503,'演示会话数量已达上限，请稍后重试。');reservation={fingerprint,id:randomUUID(),lastSeen:this.now()};this.starts.set(input.requestId,reservation);}
  const {id}=reservation;reservation.lastSeen=this.now();
  const operation=this.controlled(id,async ctx=>{
   const date=new Date(this.now()).toISOString();const target=input.mode==='diagnosis'?null:input.focus;
   const s:Internal={id,mode:input.mode,scenario:input.scenario,intent:input.intent,phase:'awaiting',revision:0,task:{id:'diagnosis',kind:'diagnosis',difficulty:'normal',prompt:input.scenario==='campus'?'向同学表达想法或请求。请输入你想诊断的一至三句英文；结合你填写的原意理解语境。':'向同事表达想法或请求。请输入你想诊断的一至三句英文；结合你填写的原意理解语境。'},target,feedback:null,hint:null,taskAttempts:0,taskHints:0,retryOrdinal:0,index:0,seenAnswers:[],previousPrompts:[],contextIds:[],commands:new Map(),lastSeen:this.now(),record:{version:2,provider:this.provider.id??'mock',id,mode:input.mode,createdAt:date,updatedAt:date,status:'in_progress',target:null,diagnosisTypes:[],transferResults:[],hintCount:0,retryCount:0,attempts:[]}};
   if(input.mode==='transfer')s.task=await this.generate(s,0,'initial','normal',ctx);
   if(ctx.signal.aborted)throw new ProviderError(504,'timeout','训练创建超时。');const view=this.project(s);this.sessions.set(id,s);return view;
  });this.startFlights.set(input.requestId,operation);
  try{return await operation;}finally{this.startFlights.delete(input.requestId);}
 }
 async command(id:string,raw:unknown):Promise<Session>{
  const c=CommandSchema.parse(raw),current=this.get(id),fingerprint=JSON.stringify({...c,requestId:undefined});
  const previous=current.commands.get(c.requestId);if(previous){if(previous.fingerprint!==fingerprint)throw new TeachingError(409,'请求键已使用，不能修改提交内容。');return this.view(id);}
  const flight=this.flights.get(id);if(flight){if(flight.requestId===c.requestId&&flight.fingerprint===fingerprint)return flight.promise;throw new TeachingError(409,'本轮正在处理另一个请求，请等待并同步状态。');}
  const known=this.fingerprints.get(id)??new Map<string,string>();if(known.has(c.requestId)&&known.get(c.requestId)!==fingerprint)throw new TeachingError(409,'失败请求键也不可修改提交内容。');
  if(c.revision!==current.revision)throw new TeachingError(409,'训练状态已更新。请同步最新状态后重试，不会重复计数。');
  if(current.phase==='completed')throw new TeachingError(409,'本轮已结束，请开始新的训练。');
  if(known.size>=100&&!known.has(c.requestId)&&c.type!=='reset'&&!(c.type==='action'&&c.action==='finish'))throw new TeachingError(409,'本轮操作已达上限，请结束或重置。');
  if(c.type==='submit'&&current.phase!=='awaiting')throw new TeachingError(409,'请先进入独立作答任务，不能重复提交反馈。');
  if(c.type==='action'&&!this.project(current).allowedActions.includes(c.action))throw new TeachingError(409,'当前状态不允许该教学动作。');
  known.set(c.requestId,fingerprint);this.fingerprints.set(id,known);
  const operation=this.controlled(id,async ctx=>{
   const s=structuredClone(current);
   if(c.type==='reset'||(c.type==='action'&&c.action==='finish')){s.phase='completed';s.record.status=c.type==='reset'?'stopped':'completed';}
   else if(c.type==='submit')await this.submit(s,c,ctx);
   else if(c.type==='action')await this.action(s,c.action,ctx);
   s.revision++;s.lastSeen=this.now();s.record.updatedAt=new Date(this.now()).toISOString();s.commands.set(c.requestId,{fingerprint});
   RecordSchema.parse(s.record);const view=this.project(s);
   if(ctx.signal.aborted||this.sessions.get(id)!==current||this.sessions.get(id)?.revision!==c.revision)throw new TeachingError(409,'操作已超时或状态改变，过期响应未提交。');
   this.sessions.set(id,s);return view;
  });this.flights.set(id,{requestId:c.requestId,fingerprint,promise:operation});
  try{return await operation;}finally{this.flights.delete(id);}
 }
 private async generate(s:Internal,index:number,kind:Task['kind'],difficulty:Task['difficulty'],ctx:CallContext):Promise<TaskSpec>{
  let task:TaskSpec;
  if(this.provider.generateTask){
   const input={target:s.target!,kind,difficulty,index,scenario:s.scenario,previousPrompts:s.previousPrompts,sourceText:s.record.attempts[0]?.text??s.intent};
   task=await this.provider.generateTask(input,ctx);
   if((this.provider.id??'mock')!=='mock'){const checked=GeneratedTaskSchema.safeParse({prompt:task.prompt,meaning:task.meaning,reference:task.reference,hint:task.hint,contextId:task.contextId});if(!checked.success)throw new ProviderError(502,'task_invalid','生成任务结构无效。');assertTaskSafety(checked.data,input);}
   task.kind=kind;task.difficulty=difficulty;
   if(s.contextIds.includes(task.contextId??'')&&kind==='transfer')throw new ProviderError(502,'task_repeat','迁移情境标识重复，已拒绝。');
   // 目标由原诊断确定，不能被模型生成任务时偷换。
   task.goal=goalFor(s.target!);
  }else{if(typeof s.target!=='string')throw new ProviderError(502,'target','Mock不能使用动态AI目标。');task=taskFor(s.target,index,kind,difficulty);}
  s.previousPrompts.push(task.prompt);if(task.contextId)s.contextIds.push(task.contextId);return task;
 }
 private async submit(s:Internal,c:Extract<Command,{type:'submit'}>,ctx:CallContext){
  let feedback:Feedback;
  if(s.task.kind==='diagnosis'){
   const checked=DiagnosticResultSchema.safeParse(await this.provider.diagnose(c.text,s.scenario,ctx,s.intent));if(!checked.success)throw new ProviderError(502,'diagnosis','诊断输出格式无效，状态未修改。');
   const result=checked.data;s.target=result.target;
   feedback={diagnosis:result.diagnosis,outcome:null,decision:result.target?'practice':'finish',reason:result.diagnosis.assessment==='unassessed'?'未评估：缺乏可靠证据，未生成训练目标。':result.target?'选择本轮第一个高价值目标；最多展示三个问题。':'表达已获认可；不制造训练目标。'};
  }else{
   if(!isSpec(s.task))throw new TeachingError(500,'任务数据无效。');
   const checked=EvaluationSchema.safeParse(await this.provider.evaluate(c.text,s.task,ctx));if(!checked.success)throw new ProviderError(502,'evaluation','评价输出格式无效，状态未修改。');
   const result=checked.data,copied=s.seenAnswers.includes(normalize(c.text));
   const outcome:Outcome=copied?'copied_answer':result.verdict==='success'?(s.taskHints>0?'hinted_success':s.taskAttempts>0||s.retryOrdinal>0?'retry_success':'first_independent_success'):result.verdict==='partial'?'partial':result.verdict==='failure'?'failure':'unassessed';
   const decision=chooseDecision(outcome,s.task.kind,s.taskAttempts+1);
   feedback={diagnosis:{...result.diagnosis,nextAction:decision},outcome,decision,dimensions:result.dimensions,reason:copied?'重复了已见作答／参考答案，不认定独立检索成功。请结合新情境重新表达。':result.reason};
  }
  feedback.diagnosis.original=c.text;feedback.diagnosis.nextAction=feedback.decision;s.feedback=feedback;s.phase='feedback';s.taskAttempts++;
  s.record.target=s.target?goalFor(s.target).chunk:null;s.record.diagnosisTypes=Array.from(new Set([...s.record.diagnosisTypes,...feedback.diagnosis.issues.map(i=>i.category)]));
  s.record.attempts.push({id:c.requestId,createdAt:new Date(this.now()).toISOString(),task:publicTask(s.task),text:c.text,hintCount:s.taskHints,retryCount:s.retryOrdinal,feedback});
  if(s.task.kind==='transfer'&&feedback.outcome)s.record.transferResults.push(feedback.outcome);
  s.seenAnswers.push(normalize(c.text),...feedback.diagnosis.issues.filter(i=>i.natural).map(i=>normalize(i.natural!)));
 }
 private async action(s:Internal,action:Feedback['decision'],ctx:CallContext){
  if(action==='hint'&&s.phase==='awaiting'){if(!isSpec(s.task))throw new TeachingError(409,'诊断输入不提供目标提示。');s.hint=s.task.hint;s.taskHints++;s.record.hintCount++;return;}
  const retry=['retry','hint','lower'].includes(action);
  if(action==='practice'){s.index=0;s.task=await this.generate(s,0,'practice','normal',ctx);s.taskAttempts=0;s.retryOrdinal=0;s.taskHints=0;}
  else if(action==='transfer'||action==='challenge'){s.index++;s.task=await this.generate(s,s.index,'transfer',action==='challenge'?'challenge':'normal',ctx);s.taskAttempts=0;s.retryOrdinal=0;s.taskHints=0;}
  else if(retry){
   if(s.task.kind==='diagnosis')throw new TeachingError(409,'诊断输入不支持该动作。');s.retryOrdinal++;s.record.retryCount++;
   if(action==='lower'){// 降难度不重新泄露答案或改变语义目标，无需额外收费调用。
    s.task={...s.task,difficulty:'easy',prompt:s.task.prompt+' 请只写一个简短句子，先完成核心交际目标。'};
   }
   if(action==='hint'){s.taskHints++;s.record.hintCount++;}
  }
  s.hint=action==='hint'&&isSpec(s.task)?s.task.hint:null;s.feedback=null;s.phase='awaiting';
 }
}
