import {z} from 'zod';
import type {Steps} from './types';

export {stakeholderId} from './stakeholder-config';
import {stakeholderId,type StakeholderConfig} from './stakeholder-config';
export type StakeholderId=z.infer<typeof stakeholderId>;
export type PublicStakeholder={id:StakeholderId;name:string;role:string;initials:string;concern:string;starters:string[]};
export type ChatMessage={id:string;role:'user'|'assistant';content:string;created_at:string};
export type Conversation={id:string;stakeholder_id:StakeholderId;messages:ChatMessage[];request_ids:string[]};
const evidence=z.object({message_id:z.string().min(1).max(100),quote:z.string().min(1).max(500)}).strict();
const point=z.object({text:z.string().min(1).max(600),evidence:z.array(evidence).min(1).max(3)}).strict();
export const reflectionSchema=z.object({operational_concerns:z.array(point).max(4),risk_concerns:z.array(point).max(4),addressed:z.array(point).max(4),evidence_gaps:z.array(point).max(4),improvements:z.array(point).max(4)}).strict();
export type Reflection=z.infer<typeof reflectionSchema>;
export type ReviewState={conversations:Record<StakeholderId,Conversation>;reflection:Reflection|null};
export type ReviewRecord={id:string;user_id:string;attempt_id:string;case_id:string;state:ReviewState;version:number;lease_token:string|null;lease_until:string};
export type PerformanceSummary={attempt_id:string;attempt_number:number;scenario_title:string;business_problem:string;requirements:string;mode:'demo'|'openai';steps:Steps;accuracy:number;sample_size:number;planted_caught:number;planted_total:number;matched:number;missed:number;errors:number;decision_counts:Record<string,number>;decisions:{record:string;decision:string;match:boolean;reason:string;outputs:{extract:string;check:string;flag:string};error?:string}[]};
export type StakeholderSetup={configuration:StakeholderConfig|null;generation_available:boolean};
export type ReviewResponse={review_id:string;attempt:PerformanceSummary;personas:PublicStakeholder[];conversations:Record<StakeholderId,Omit<Conversation,'request_ids'>>;reflection:Reflection|null;version:number;local:boolean};
export const chatInput=z.object({scenario_id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),attempt_id:z.string().uuid(),stakeholder_id:stakeholderId,conversation_id:z.string().uuid(),request_id:z.string().uuid(),action:z.enum(['start','send','restart','reflect']),message:z.string().trim().min(1).max(2000).optional(),confirmed:z.boolean().optional()}).strict().superRefine((value,ctx)=>{if(value.action==='send'&&!value.message)ctx.addIssue({code:'custom',path:['message'],message:'Write a message before sending.'});if(value.action==='restart'&&value.confirmed!==true)ctx.addIssue({code:'custom',path:['confirmed'],message:'Confirm before restarting this conversation.'});});
