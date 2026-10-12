import type { TaskSpec } from '../server/tasks.js';
export const tripGoal={chunk:'go on a trip',meaning:'表达一次旅行活动，检索旅行词块',equivalents:['take a trip']};
export const travelTask:TaskSpec={id:'quality-travel',kind:'transfer',difficulty:'normal',target:'request',goal:tripGoal,topic:/\btrip\b/,prompt:'你正在制定今年夏天去西安的旅行计划，请向同学说明你的安排。',meaning:'自己计划今年夏天去西安旅行，地点西安、时间今年夏天、人物自己',reference:"I plan to go on a trip to Xi'an this summer.",hint:'考虑表示参加一次旅行活动的动词搭配。',contextId:'夏季西安旅行计划'};
export const qualityCases=[
 {id:'A',input:'I went a trip to Hangzhou last year.',expect:'识别go on a trip及介词on，核对解释而非仅验证JSON。'},
 {id:'B',input:'I want to learn more knowledge.',expect:'推荐gain knowledge/learn about，不声称learn和knowledge绝对禁止。'},
 {id:'C',input:'I really enjoyed my trip to Hangzhou last year.',expect:'no_issue且不强制训练目标。'},
 {id:'D',input:"I'm planning to visit Xi'an this summer.",expect:'英语正确自然，任务信息匹配；未必检索go on a trip，不能报grammar。'},
 {id:'E',input:'尚未作答的动态迁移任务',expect:'公开prompt无目标英语或示范句，私有reference不送给学生。'},
 {id:'F',input:"I'm going on a trip to Xi'an this summer.",expect:'真实记录先请求提示，成功不得算首次无提示；服务端固定任务夹具。'},
 {id:'G',input:"I'm going on a trip to Hangzhou next winter.",expect:'语言与搭配正确，但地点/时间不符；目标检索与任务失败分别标记。'},
 {id:'H',input:'根据F实际事件总结本轮',expect:'只引用真实事件；初练成功不能补造迁移成功或长期掌握。'}
] as const;
