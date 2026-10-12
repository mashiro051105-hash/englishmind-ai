import type { PracticeRecord } from '../shared/contracts.js';
import { SummarySchema } from '../shared/quality.js';
import { ProviderError } from './provider.js';
export function summaryFacts(record:PracticeRecord){
 const attempts=record.attempts,transfers=attempts.filter(a=>a.task.kind==='transfer');
 const practice=attempts.filter(a=>a.task.kind!=='transfer'&&a.task.kind!=='diagnosis');
 return {practiceSuccessCount:practice.filter(a=>['first_independent_success','hinted_success','retry_success'].includes(a.feedback.outcome??'')).length,hintedPracticeSuccessCount:practice.filter(a=>a.feedback.outcome==='hinted_success').length,totalHintCount:record.hintCount,totalRetryCount:record.retryCount,attemptCount:attempts.length,transferCount:transfers.length,independentSuccessCount:transfers.filter(a=>a.feedback.outcome==='first_independent_success').length,hintedSuccessCount:transfers.filter(a=>a.feedback.outcome==='hinted_success').length,retrySuccessCount:transfers.filter(a=>a.feedback.outcome==='retry_success').length};
}
export function verifiedSummary(data:unknown,record:PracticeRecord){
 const parsed=SummarySchema.safeParse(data);if(!parsed.success)throw new ProviderError(502,'summary_invalid','总结结构无效，待人工确认。');
 const facts=summaryFacts(record);for(const key of Object.keys(facts) as (keyof typeof facts)[])if(parsed.data[key]!==facts[key])throw new ProviderError(502,'summary_history','总结与实际练习记录不一致，已拒绝。');
 const ids=new Set(record.attempts.map(a=>a.id));if(parsed.data.evidenceIds.some(id=>!ids.has(id))||/长期掌握|已经掌握|mastered|长期进步|连续\d+天/i.test(parsed.data.statement.replace(/(?:不代表|不能证明|不意味着|无法证明|不应认定)[^。；]*?(?:长期掌握|已经掌握|mastered|长期进步)/gi,'')))throw new ProviderError(502,'summary_history','总结包含未经证实的历史或掌握结论，已拒绝。');return parsed.data;
}
