import { RequestSchema, ResponseSchema, type Diagnosis, type TrainingResponse } from '../shared/contracts.js';
import type { SyncTeachingProvider, Evaluation } from './provider.js';
import { targetChunks, type Target, type TaskSpec } from './tasks.js';
export const samples = [
 {text:'I very like English.',category:'grammar',natural:'I really like English.',explanation:'very 通常不能直接修饰 like；可使用 really。单次错误不足以归因为母语迁移。',chunks:['really like','enjoy learning'],target:'intensity'},
 {text:'I want to learn more knowledge.',category:'collocation',natural:'I want to gain more knowledge.',explanation:'gain knowledge 是常见搭配；learn 更常接具体内容或 about + 主题。',chunks:['gain knowledge','learn about a topic'],target:'knowledge'},
 {text:'Give me your notes.',category:'contextual_mismatch',natural:'Could you share your notes with me?',explanation:'语法正确。此处假设向不熟悉的同学借笔记，直接命令可能生硬；熟人和紧急情境另行判断。',chunks:['Could you share … with me?'],target:'request'},
 {text:'I think this plan is good.',category:'acceptable_but_improvable',natural:'I think this plan could work well.',explanation:'原句正确；讨论可行性时可选更具体的表述。这是可选优化。',chunks:['could work well'],target:'plan'},
 {text:'Could you help me with this assignment?',category:'no_issue',natural:'Could you help me with this assignment?',explanation:'向同学请求作业帮助时表达自然、礼貌，无须制造错误。',chunks:[],target:null}
] as const;
export function normalize(text:string){return text.toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9\s']/g,' ').replace(/\s+/g,' ').trim();}
function diagnostic(text:string,category:typeof samples[number]['category'],natural:string|null,explanation:string,chunks:string[]):Diagnosis {
 return {original:text,assessment:'assessed',issues:[{category,natural,explanation,chunks}],nextAction:category==='no_issue'?'finish':'practice'};
}
export const mockProvider:SyncTeachingProvider = {
 diagnose(text,scenario){
  const s=samples.find(s=>normalize(s.text)===normalize(text));
  if(s)return {diagnosis:diagnostic(text,s.category,s.natural,s.explanation,[...s.chunks]),target:s.target};
  const clauses=text.split(/(?<=[.!?])\s+/).slice(0,20);
  const matched=clauses.map(c=>samples.find(s=>normalize(s.text)===normalize(c))).filter(s=>s!==undefined);
  if(matched.length&&matched.length===clauses.length){const prioritized=matched.some(s=>s.target)?matched.filter(s=>s.target).slice(0,3):matched.slice(0,1);return {diagnosis:{original:text,assessment:'assessed',issues:prioritized.map(s=>({category:s.category,natural:s.natural,explanation:s.explanation,chunks:[...s.chunks]})),nextAction:prioritized.some(s=>s.target)?'practice':'finish'},target:prioritized.find(s=>s.target)?.target??null};}
  // 只承认可核验的有限句式，不把规则未覆盖的句子判成错误。
  const natural=/^i (?:really (?:like|love|enjoy)|enjoy) (?:english|photography|hiking|reading novels)[.!]?$/i.test(text.trim()) || /^i (?:want|hope) to (?:gain (?:more )?knowledge about|learn (?:more )?about) (?:astronomy|cooking|robotics)[.!]?$/i.test(text.trim());
  if(natural)return {diagnosis:diagnostic(text,'no_issue',text,'该句在当前演示覆盖的语境中表达合理，无须强行纠错。',[]),target:null};
  void scenario;
  return {diagnosis:{original:text,assessment:'unassessed',issues:[],nextAction:'finish'},target:null};
 },
 evaluate(text,task):Evaluation {
  const n=normalize(text);const topic=task.topic.test(n);
  const blocked=/\b(?:not|never|dont|don't|cannot|cant|can't|wont|won't|hate|dislike)\b/.test(n) || /["“”]/.test(text) || /\b(?:example|sentence|phrase|said|says|means)\b/.test(n);
  const syntax:Record<Target,RegExp>={
   intensity:/^i (?:(?:really|absolutely) (?:like|love|enjoy)|enjoy) (?:photography|taking (?:photos|pictures)|hiking|reading novels|novels)$|^i like (?:photography|taking (?:photos|pictures)|hiking|reading novels|novels) very much$/,
   knowledge:/^i (?:want|hope|would like|aim) to (?:gain|acquire|build) (?:more |some )?knowledge (?:about|of|in) (?:astronomy|cooking|robotics)$|^i (?:want|hope|would like|aim) to learn (?:more )?about (?:astronomy|cooking|robotics)$/,
   request:/^(?:could|can|would) you (?:please )?(?:share|lend|give|call|book|get|help|tell|show)\b|^would you mind (?:sharing|lending|calling|booking|telling|showing)\b|^(?:could|can|may) i (?:please )?(?:have|borrow|get)\b/,
   plan:/^i think (?:this|the) (?:plan|idea|proposal|schedule|arrangement|recycling proposal) (?:could|will|would) work (?:well|effectively)$/
  };
  const requestRules=[
   /^(?:(?:could|can|would) you (?:please )?(?:share|lend|give) (?:your |the |some )?(?:class |lecture )?notes (?:with me|to me)|would you mind (?:sharing|lending) (?:your |the )?(?:class |lecture )?notes (?:with me|to me)|(?:could|can|may) i (?:please )?(?:have|borrow) (?:your |the )?(?:class |lecture )?notes)(?: please)?$/,
   /^(?:(?:could|can|would) you (?:please )?(?:call|book|get) (?:a |the )?(?:taxi|cab) for me|would you mind (?:calling|booking) (?:a |the )?(?:taxi|cab) for me|(?:could|can) i (?:please )?get a (?:taxi|cab))(?: please)?$/,
   /^(?:(?:could|can|would) you (?:please )?(?:tell|show) me (?:the way|directions|how to get) to (?:the )?(?:train |railway )?station|would you mind (?:telling|showing) me (?:the way|directions|how to get) to (?:the )?(?:train |railway )?station)(?: please)?$/
  ];
  const taskIndex=Number(task.id.split('-')[1]) % 3;
  const requestIntent=task.target!=='request'||requestRules[taskIndex].test(n);
  const forbiddenTopic:Record<Target,RegExp>={intensity:/\b(?:taxi|astronomy|cooking|station|notes)\b/,knowledge:/\b(?:taxi|notes|station)\b/,request:/\b(?:hiking|astronomy|cooking|novels)\b/,plan:/\b(?:taxi|notes|hiking)\b/};
  // 只覆盖一个请求/陈述句；否定、引述、串联多意图均不评为成功。
  const oneSentence=text.trim().split(/[.!?]+/).filter(s=>s.trim()).length===1 && !/\b(?:but|and|or|although|because)\b/.test(n);
  const pass=topic&&syntax[task.target].test(n)&&requestIntent&&!blocked&&!forbiddenTopic[task.target].test(n)&&oneSentence;
  const scope=topic||syntax[task.target].test(n)||/\b(?:very like|learn (?:more )?knowledge|give me|really like|gain knowledge|could you)\b/.test(n);
  const knownError=/\bi very like\b/.test(n)?'grammar':/\blearn (?:more )?knowledge\b/.test(n)?'collocation':/^give me\b/.test(n)?'contextual_mismatch':null;
  const badRequest=task.target==='request'&&(/\b(?:for|with|to) (?:him|her|them|us)\b/.test(n)||(taskIndex===1&&/\b(?:share|lend|sharing|lending)\b/.test(n))||(taskIndex===0&&/\b(?:call|book|calling|booking)\b/.test(n)));
  const mismatch=blocked||!oneSentence||forbiddenTopic[task.target].test(n)||badRequest||(!topic&&(syntax[task.target].test(n)||!!knownError));
  const verdict=pass?'success':!scope?'unassessed':mismatch?'failure':knownError?'partial':'unassessed';
  const reason=pass?'本题规则检查通过：表达框架、意图和情境对象一致。仅代表本次有限 Mock 练习。':verdict==='unassessed'?'输入超出有限 Mock 规则覆盖，不能可靠判断；未匹配规则不等于英语有错。':verdict==='failure'?'表达未满足当前情境的意图／对象，或是否定、引用和多意图句；请重新组织本题的表达。':'包含本题对象，但存在已覆盖的表达问题；可请求提示再试。';
  const category=task.target==='intensity'?'grammar':task.target==='knowledge'?'collocation':task.target==='request'?'contextual_mismatch':'acceptable_but_improvable';
  const diag:Diagnosis=(verdict==='unassessed'||(verdict==='partial'&&!knownError))?{original:text,assessment:'unassessed',issues:[],nextAction:'retry'}:diagnostic(text,pass?'no_issue':knownError??(verdict==='failure'?'contextual_mismatch':category),pass?text:task.reference,reason,pass?[]:[targetChunks[task.target]]);
  return {verdict,reason,diagnosis:diag};
 }
};
export function mockRespond(raw:unknown):TrainingResponse {
 const input=RequestSchema.parse(raw);
 if(input.mode==='conversation')return ResponseSchema.parse({provider:'mock',reply:input.scenario==='campus'?'Thanks for sharing! What do you enjoy most about studying English?\n（固定脚本，Mock 不理解输入，也无对话上下文。）':'What is one project goal for this week?\n（固定脚本，Mock 不理解输入，也无对话上下文。）',diagnosis:null,nextAction:'finish',assessed:false});
 const {diagnosis}=mockProvider.diagnose(input.text,input.scenario);
 return ResponseSchema.parse({provider:'mock',reply:diagnosis.assessment==='assessed'?'有限预设规则反馈，非真实 AI 推理。':'未评估：不在当前 Mock 覆盖范围内。',diagnosis,nextAction:diagnosis.nextAction,assessed:diagnosis.assessment==='assessed'});
}
