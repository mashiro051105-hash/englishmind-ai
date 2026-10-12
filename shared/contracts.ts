import { z } from 'zod';
export const ProviderSchema=z.enum(['mock','openai']);
export const ModeSchema = z.enum(['conversation', 'diagnosis', 'transfer']);
export type Mode = z.infer<typeof ModeSchema>;
export const ScenarioSchema = z.enum(['campus','work']);
export const CategorySchema = z.enum(['grammar','collocation','contextual_mismatch','acceptable_but_improvable','no_issue']);
export const ActionSchema = z.enum(['practice','transfer','retry','hint','lower','challenge','finish']);
export const IssueSchema = z.object({category:CategorySchema,explanation:z.string().max(1500),natural:z.string().max(2000).nullable(),chunks:z.array(z.string().max(120)).max(5)});
export const DiagnosisSchema = z.object({original:z.string().max(2000),assessment:z.enum(['assessed','unassessed']),issues:z.array(IssueSchema).max(3),nextAction:ActionSchema}).superRefine((d,ctx)=>{if(d.assessment==='unassessed'&&d.issues.length)ctx.addIssue({code:'custom',message:'未评估时不能制造诊断问题'});});
export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export const RequestSchema = z.object({mode:ModeSchema,text:z.string().trim().min(1).max(2000),scenario:ScenarioSchema.default('campus')}).strict();
export const ResponseSchema = z.object({provider:ProviderSchema,reply:z.string(),diagnosis:DiagnosisSchema.nullable(),nextAction:ActionSchema,assessed:z.boolean()});
export type TrainingResponse = z.infer<typeof ResponseSchema>;
export const OutcomeSchema = z.enum(['first_independent_success','hinted_success','retry_success','partial','failure','unassessed','copied_answer']);
export type Outcome = z.infer<typeof OutcomeSchema>;
export const FeedbackSchema = z.object({diagnosis:DiagnosisSchema,outcome:OutcomeSchema.nullable(),reason:z.string(),decision:ActionSchema});
export type Feedback = z.infer<typeof FeedbackSchema>;
export const TaskSchema = z.object({id:z.string(),kind:z.enum(['diagnosis','initial','practice','transfer']),prompt:z.string(),difficulty:z.enum(['normal','easy','challenge'])});
export type Task = z.infer<typeof TaskSchema>;
export const AttemptSchema = z.object({id:z.string(),createdAt:z.string().datetime(),task:TaskSchema,text:z.string().trim().min(1).max(2000),hintCount:z.number().int().nonnegative(),retryCount:z.number().int().nonnegative(),feedback:FeedbackSchema}).superRefine((a,ctx)=>{
 if(a.feedback.outcome==='first_independent_success'&&(a.hintCount>0||a.retryCount>0))ctx.addIssue({code:'custom',message:'有提示或重试不能算首次独立成功'});
 if(a.feedback.outcome==='hinted_success'&&a.hintCount===0)ctx.addIssue({code:'custom',message:'提示后成功必须有提示事件'});
 if(a.feedback.outcome==='retry_success'&&a.retryCount===0)ctx.addIssue({code:'custom',message:'重试成功必须有重试事件'});
 if(a.task.kind==='diagnosis'&&a.feedback.outcome!==null)ctx.addIssue({code:'custom',message:'诊断不记录检索结果'});
});
export const RecordSchema = z.object({version:z.literal(2),provider:ProviderSchema.default('mock'),id:z.string(),mode:ModeSchema,createdAt:z.string().datetime(),updatedAt:z.string().datetime(),status:z.enum(['in_progress','completed','stopped','legacy']),target:z.string().nullable(),diagnosisTypes:z.array(CategorySchema),transferResults:z.array(OutcomeSchema),hintCount:z.number().int().nonnegative(),retryCount:z.number().int().nonnegative(),attempts:z.array(AttemptSchema),legacyText:z.string().optional()}).superRefine((r,ctx)=>{
 const transfers=r.attempts.filter(a=>a.task.kind==='transfer').map(a=>a.feedback.outcome).filter(o=>o!==null);
 if(JSON.stringify(transfers)!==JSON.stringify(r.transferResults))ctx.addIssue({code:'custom',message:'迁移结果必须来自已提交的迁移作答'});
});
export type PracticeRecord = z.infer<typeof RecordSchema>;
export const SessionSchema = z.object({id:z.string().uuid(),provider:ProviderSchema,revision:z.number().int().nonnegative(),mode:z.enum(['diagnosis','transfer']),phase:z.enum(['awaiting','feedback','completed']),task:TaskSchema,feedback:FeedbackSchema.nullable(),hint:z.string().nullable(),allowedActions:z.array(ActionSchema),record:RecordSchema.nullable()}).superRefine((s,ctx)=>{
 if(s.phase==='feedback'&&(!s.feedback||!s.record))ctx.addIssue({code:'custom',message:'反馈阶段必须有提交后的反馈及档案'});
 if(s.phase==='completed'&&!s.record)ctx.addIssue({code:'custom',message:'结束阶段必须有本轮档案'});
 if(s.phase==='awaiting'&&(s.feedback!==null||s.record!==null))ctx.addIssue({code:'custom',message:'独立作答时不可返回参考反馈或含答案档案'});
});
export type Session = z.infer<typeof SessionSchema>;
export const StartSchema = z.object({requestId:z.string().uuid(),mode:z.enum(['diagnosis','transfer']),scenario:ScenarioSchema,intent:z.string().trim().max(500).default(''),focus:z.enum(['intensity','knowledge','request']).default('request')}).strict();
const commandBase={requestId:z.string().uuid(),revision:z.number().int().nonnegative()};
export const CommandSchema = z.discriminatedUnion('type',[
 z.object({...commandBase,type:z.literal('submit'),text:z.string().trim().min(1).max(2000)}).strict(),
 z.object({...commandBase,type:z.literal('action'),action:ActionSchema}).strict(),
 z.object({...commandBase,type:z.literal('reset')}).strict()
]);
export type Command = z.infer<typeof CommandSchema>;
export const categoryLabels:Record<z.infer<typeof CategorySchema>,string>={grammar:'语法错误',collocation:'搭配不自然',contextual_mismatch:'语境不合适',acceptable_but_improvable:'正确，可优化',no_issue:'没有明显问题'};
export const actionLabels:Record<z.infer<typeof ActionSchema>,string>={practice:'针对性练习',transfer:'进入迁移检验',retry:'重新作答',hint:'请求提示',lower:'降低难度再试',challenge:'增加情境变化',finish:'结束本轮'};
export const outcomeLabels:Record<Outcome,string>={first_independent_success:'首次独立成功（仅本题）',hinted_success:'提示后成功',retry_success:'重试后成功',partial:'部分成功',failure:'失败',unassessed:'未评估',copied_answer:'重复已见答案，不能认定独立检索'};
