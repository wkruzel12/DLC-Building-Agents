import {z} from 'zod';

export const MAX_CASE_BYTES=1024*1024;
export const MAX_CASE_ITEMS=20;
const decision=z.enum(['advance','reject','human_review']);
const text=(max:number)=>z.string().trim().min(1).max(max);
export const caseSchema=z.object({
 id:text(100).regex(/^[a-zA-Z0-9_-]+$/,'Use letters, numbers, hyphens, or underscores for the case ID.'),
 title:text(180),story:text(12000),task:text(6000),requirements:text(12000),
 decisions:z.array(decision).min(1).max(3),
 items:z.array(z.object({id:text(100),label:text(200),text:text(12000)})).min(1).max(MAX_CASE_ITEMS),
 answer_key:z.array(z.object({item_id:text(100),decision,planted:z.boolean(),note:z.string().max(6000).default('')})).min(1).max(MAX_CASE_ITEMS),
 characters:z.array(z.unknown()).max(30).default([]),rubric:z.record(z.unknown()).default({}),skill_tags:z.array(text(100)).max(15).default([])
}).superRefine((value,ctx)=>{
 const ids=new Set(value.items.map(item=>item.id));
 if(ids.size!==value.items.length)ctx.addIssue({code:'custom',path:['items'],message:'Record IDs must be unique.'});
 if(new Set(value.decisions).size!==value.decisions.length)ctx.addIssue({code:'custom',path:['decisions'],message:'Decisions must be unique.'});
 const keys=new Set(value.answer_key.map(item=>item.item_id));
 if(keys.size!==value.answer_key.length||keys.size!==ids.size||[...keys].some(id=>!ids.has(id)))ctx.addIssue({code:'custom',path:['answer_key'],message:'Provide exactly one grading entry for every record ID.'});
 if(value.answer_key.some(item=>!value.decisions.includes(item.decision)))ctx.addIssue({code:'custom',path:['answer_key'],message:'Every grading decision must be in the decisions list.'});
});
