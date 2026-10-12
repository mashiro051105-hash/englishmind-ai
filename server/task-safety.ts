import { ProviderError, type GenerationInput, type Goal, type TeachingTarget } from './provider.js';
import { targetChunks } from './tasks.js';
export function goalFor(target:TeachingTarget):Goal{return typeof target==='string'?{chunk:targetChunks[target],meaning:({intensity:'强调自己的喜好',knowledge:'说明增加知识或了解主题的学习目标',request:'向不熟悉的人礼貌请求帮助',plan:'讨论方案的可行性'})[target],equivalents:[]}:target;}
export function assertTaskSafety(task:{prompt:string,reference:string,contextId:string},input:GenerationInput){
 // 提示一律使用中文；英语教学内容只留在服务端，学生主动请求提示时才展示。
 if(/\p{Script=Latin}/u.test(task.prompt.normalize('NFKC'))||/答案|参考表达|词块|句型|使用.*表达|请用.*结构|提示[:：]|例如/.test(task.prompt))throw new ProviderError(502,'task_leak','生成任务含英语或答案提示，已拒绝；可安全重试。');
 const normalized=(s:string)=>s.replace(/[\s，。！？、：；.!?,;:\x22\x27“”]/g,'').toLowerCase();
 const p=normalized(task.prompt);
 const grams=(s:string)=>new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));
 const tooSimilar=(old:string)=>{const a=grams(normalized(old)),b=grams(p);const intersection=[...a].filter(g=>b.has(g)).length;return intersection/Math.max(1,a.size+b.size-intersection)>0.72;};
 if(input.previousPrompts.some(old=>normalized(old)===p||p.includes(normalized(old))||normalized(old).includes(p)||input.kind==='transfer'&&tooSimilar(old)))throw new ProviderError(502,'task_repeat','生成任务重复旧情境，已拒绝；可重试。');
 if(input.kind==='transfer'&&input.sourceText&&normalized(input.sourceText)===normalized(task.reference))throw new ProviderError(502,'task_repeat','迁移参考句重复原句，已拒绝。');
 if(!task.reference.trim())throw new ProviderError(502,'task_invalid','任务缺少内部评价标准。');
}
