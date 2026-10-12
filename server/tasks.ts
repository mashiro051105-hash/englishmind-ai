import type { Goal } from './provider.js';
import type { Task } from '../shared/contracts.js';
export type Target = 'intensity'|'knowledge'|'request'|'plan';
export type TaskSpec = Task & {target:Target,topic:RegExp,reference:string,hint:string,meaning?:string,contextId?:string,goal?:Goal};
export const targetChunks:Record<Target,string>={intensity:'really like / enjoy + -ing',knowledge:'gain knowledge / learn about',request:'Could you …? / Would you mind …?',plan:'could work well'};
const bank:Record<Target, {prompt:string,topic:RegExp,reference:string}[]>={
 intensity:[
  {prompt:'向新同学说明：你很喜欢摄影。用一句英语表达自己的喜好。',topic:/\bphotography\b|\btaking (?:photos|pictures)\b/,reference:'I really like photography.'},
  {prompt:'旅行时结识新朋友，告诉对方你很喜欢徒步。用一句英语表达喜好。',topic:/\bhiking\b/,reference:'I really enjoy hiking.'},
  {prompt:'在读书会自我介绍，告诉大家你很喜欢阅读小说。',topic:/\b(?:reading )?novels\b/,reference:'I really like reading novels.'}
 ],
 knowledge:[
  {prompt:'你准备参加天文学活动，向组织者说明你希望增加天文学方面的知识。',topic:/\bastronomy\b/,reference:'I want to gain more knowledge about astronomy.'},
  {prompt:'你报名参加烹饪课程，说明你希望学到更多烹饪知识。用一句英语表达学习目标。',topic:/\bcooking\b/,reference:'I hope to learn more about cooking.'},
  {prompt:'你申请一个机器人社团，说明你希望增加机器人领域的知识。',topic:/\brobotics\b/,reference:'I would like to gain knowledge about robotics.'}
 ],
 request:[
  {prompt:'向一位不熟悉的同学礼貌地请求：把课堂笔记分享给你。',topic:/\b(?:class |lecture )?notes\b/,reference:'Could you share your notes with me?'},
  {prompt:'你到酒店前台，礼貌地请求工作人员帮你叫一辆出租车。用一句英语提出请求。',topic:/\b(?:taxi|cab)\b/,reference:'Could you call a taxi for me?'},
  {prompt:'在陌生城市迷路，你想向路人礼貌地问去火车站的路。',topic:/\b(?:train |railway )?station\b/,reference:'Could you tell me the way to the train station?'}
 ],
 plan:[
  {prompt:'讨论同学提出的校园环保方案，表达你认为它可行。',topic:/\b(?:plan|idea|proposal)\b/,reference:'I think this plan could work well.'},
  {prompt:'讨论同事提出的排班方案，表达你认为这个安排可行。',topic:/\b(?:schedule|arrangement)\b/,reference:'I think this schedule could work well.'},
  {prompt:'社区提出新的回收方案，表达你认为它可行。',topic:/\b(?:recycling|proposal)\b/,reference:'I think this recycling proposal could work well.'}
 ]
};
const hints:Record<Target,string>={intensity:'用修饰动词的副词强调喜好；very 通常不能直接放在 like 前。',knowledge:'考虑“获得知识”或“了解某个主题”的搭配，明确你想学的领域。',request:'用 can/could/would 等构成礼貌问句，并指出请求对方做的事。',plan:'可以具体表达方案是否“行得通”，不必把正确的 good 当作错误。'};
export function taskFor(target:Target,index:number,kind:Task['kind'],difficulty:Task['difficulty']='normal'):TaskSpec {
 const item=bank[target][index % bank[target].length];
 return {id:`${target}-${index}-${kind}-${difficulty}`,kind,difficulty,target,...item,prompt:item.prompt+(difficulty==='easy'?' 只写一个简短句子，明确人物和请求／想法即可。':difficulty==='challenge'?' 请保持情境准确，可用另一种表达框架。':''),hint:hints[target]};
}
export function publicTask(task:TaskSpec|Task):Task {return {id:task.id,kind:task.kind,prompt:task.prompt,difficulty:task.difficulty};}
