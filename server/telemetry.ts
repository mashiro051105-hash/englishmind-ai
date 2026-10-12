export interface TokenUsage{inputTokens:number|null;cachedInputTokens:number|null;outputTokens:number|null;}
export interface TokenRates{input:number;cachedInput:number;output:number;}
export interface RequestTelemetry extends TokenUsage{requestId:string;operation:string;model:string;startedAt:string;latencyMs:number;status:'success'|'failed'|'cancelled';errorCode:string|null;estimatedUsd:number|null;}
export function estimateCost(usage:TokenUsage,rates?:TokenRates){if(!rates||usage.inputTokens===null||usage.outputTokens===null)return null;const cached=Math.min(usage.inputTokens,usage.cachedInputTokens??0);return ((usage.inputTokens-cached)*rates.input+cached*rates.cachedInput+usage.outputTokens*rates.output)/1e6;}
