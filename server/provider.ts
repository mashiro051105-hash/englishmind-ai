import { z } from 'zod';
import { DimensionsSchema } from '../shared/quality.js';
import type { Dimensions } from '../shared/quality.js';
import type { PracticeRecord } from '../shared/contracts.js';
import { DiagnosisSchema, type Diagnosis, type Task } from '../shared/contracts.js';
import type { Target, TaskSpec } from './tasks.js';
export const GoalSchema=z.object({chunk:z.string().min(1).max(120),meaning:z.string().min(1).max(300),equivalents:z.array(z.string().min(1).max(120)).max(5)}).strict();
export type Goal=z.infer<typeof GoalSchema>;
export type TeachingTarget=Target|Goal;
export type Evaluation={verdict:'success'|'partial'|'failure'|'unassessed',reason:string,diagnosis:Diagnosis,dimensions?:Dimensions};
export type DiagnosticResult={diagnosis:Diagnosis,target:TeachingTarget|null};
export interface CallContext{signal:AbortSignal;consume:()=>void;}
export interface GenerationInput{target:TeachingTarget;kind:Task['kind'];difficulty:Task['difficulty'];index:number;scenario:'campus'|'work';previousPrompts:string[];sourceText:string;}
export interface TeachingProvider {
 id?:'mock'|'openai';
 diagnose(text:string,scenario:'campus'|'work',ctx?:CallContext,intent?:string):DiagnosticResult|Promise<DiagnosticResult>;
 evaluate(text:string,task:TaskSpec,ctx?:CallContext):Evaluation|Promise<Evaluation>;
 generateTask?(input:GenerationInput,ctx:CallContext):Promise<TaskSpec>;
 summarize?(record:PracticeRecord,ctx:CallContext):Promise<unknown>;
 converse?(text:string,scenario:'campus'|'work',ctx:CallContext):Promise<string>;
}
export interface SyncTeachingProvider extends TeachingProvider{
 diagnose(text:string,scenario:'campus'|'work'):DiagnosticResult;
 evaluate(text:string,task:TaskSpec):Evaluation;
}
export const DiagnosticResultSchema=z.object({diagnosis:DiagnosisSchema,target:z.union([z.enum(['intensity','knowledge','request','plan']),GoalSchema]).nullable()}).superRefine((r,ctx)=>{if(r.target&&(r.diagnosis.assessment==='unassessed'||r.diagnosis.issues.every(i=>i.category==='no_issue')))ctx.addIssue({code:'custom',message:'未评估或无问题诊断不能强行指定错误目标'});});
export const EvaluationSchema=z.object({verdict:z.enum(['success','partial','failure','unassessed']),reason:z.string().max(1500),diagnosis:DiagnosisSchema,dimensions:DimensionsSchema.optional()}).superRefine((r,ctx)=>{if(r.verdict==='success'&&(r.diagnosis.assessment!=='assessed'||r.diagnosis.issues.length!==1||r.diagnosis.issues[0].category!=='no_issue'))ctx.addIssue({code:'custom',message:'成功必须有已评估的正确表达证据且无错误'});});
export class ProviderError extends Error{constructor(public status:number,public code:string,message:string){super(message);}}
