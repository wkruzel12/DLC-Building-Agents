import {z} from 'zod';
import {decisionTypeSchema,decisionSchema,decisionProblem} from './decisions';
import {caseStakeholdersSchema} from './stakeholder-config';

export const MAX_CASE_BYTES=1024*1024;
export const MAX_CASE_ITEMS=20;
const text=(max:number)=>z.string().trim().min(1).max(max);
export const caseSchema=z.object({
 id:text(100).regex(/^[a-zA-Z0-9_-]+$/,'Use letters, numbers, hyphens, or underscores for the case ID.'),
 title:text(180),story:text(12000),task:text(6000),requirements:text(12000),
 decisions:z.array(decisionTypeSchema).min(1).max(20),
 decision_rules:z.record(decisionTypeSchema,z.object({requires_target:z.boolean()}).strict()).default({}),
 stakeholders:caseStakeholdersSchema.optional(),
 items:z.array(z.object({id:text(100),label:text(200),text:text(12000)})).min(1).max(MAX_CASE_ITEMS),
 answer_key:z.array(z.object({item_id:text(100),decision:decisionSchema,planted:z.boolean(),note:z.string().max(6000).default('')})).min(1).max(MAX_CASE_ITEMS),
 characters:z.array(z.unknown()).max(30).default([]),rubric:z.record(z.unknown()).default({}),skill_tags:z.array(text(100)).max(15).default([])
}).superRefine((value,ctx)=>{
 const ids=new Set(value.items.map(item=>item.id));
 if(ids.size!==value.items.length)ctx.addIssue({code:'custom',path:['items'],message:'Record IDs must be unique.'});
 if(new Set(value.decisions).size!==value.decisions.length)ctx.addIssue({code:'custom',path:['decisions'],message:'Decisions must be unique.'});
 const keys=new Set(value.answer_key.map(item=>item.item_id));
 if(keys.size!==value.answer_key.length||keys.size!==ids.size||[...keys].some(id=>!ids.has(id)))ctx.addIssue({code:'custom',path:['answer_key'],message:'Provide exactly one grading entry for every record ID.'});
 value.answer_key.forEach((entry,index)=>{
  if(!ids.has(entry.item_id))ctx.addIssue({code:'custom',path:['answer_key',index,'item_id'],message:'The grading record ID must exist in this case.'});
  if(value.answer_key.some((other,otherIndex)=>otherIndex!==index&&other.item_id===entry.item_id))ctx.addIssue({code:'custom',path:['answer_key',index,'item_id'],message:'Multiple grading entries reference this record; supply exactly one authoritative decision.'});
 });
 for(const [type,rule] of Object.entries(value.decision_rules)){
  if(!value.decisions.includes(type))ctx.addIssue({code:'custom',path:['decision_rules',type],message:'Decision rules must refer to a declared action.'});
  if(type==='merge'&&!rule.requires_target)ctx.addIssue({code:'custom',path:['decision_rules',type],message:'Merge always requires a target record ID.'});
 }
 value.answer_key.forEach((item,index)=>{const problem=decisionProblem(value,item.item_id,item.decision);if(problem)ctx.addIssue({code:'custom',path:['answer_key',index,'decision'],message:problem});});
});
