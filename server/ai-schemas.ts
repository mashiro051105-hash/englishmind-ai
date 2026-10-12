import { z } from 'zod';
import { CategorySchema } from '../shared/contracts.js';
import { GoalSchema } from './provider.js';
// 模型仅给诊断证据和任务内容，服务器自行计算nextAction与检索历史。
export const AIDiagnosisSchema=z.object({assessment:z.enum(['assessed','unassessed']),issues:z.array(z.object({category:CategorySchema,explanation:z.string().min(1).max(1500),natural:z.string().min(1).max(2000).nullable(),chunks:z.array(z.string().min(1).max(120)).max(5)}).strict()).max(3),goal:GoalSchema.nullable()}).strict();
export const AIEvaluationSchema=z.object({verdict:z.enum(['success','partial','failure','unassessed']),meaningCorrect:z.boolean(),naturalAndAppropriate:z.boolean(),targetOrEquivalentUsed:z.boolean(),reason:z.string().min(1).max(1500),assessment:z.enum(['assessed','unassessed']),issues:AIDiagnosisSchema.shape.issues}).strict();
export const GeneratedTaskSchema=z.object({prompt:z.string().min(10).max(600),meaning:z.string().min(1).max(500),reference:z.string().min(1).max(400),hint:z.string().min(1).max(300),contextId:z.string().min(1).max(80)}).strict();
export const ChatSchema=z.object({reply:z.string().min(1).max(2000)}).strict();
