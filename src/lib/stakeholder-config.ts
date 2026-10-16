import {z} from 'zod';

const text=(max:number)=>z.string().trim().min(1).max(max);
export const stakeholderId=text(40).regex(/^[a-z][a-z0-9_-]*$/).refine(id=>!['admin','constructor','prototype','__proto__'].includes(id),'Reserved stakeholder identifier.');
export const personaSchema=z.object({
 id:stakeholderId,name:text(100),role:text(160),initials:text(5).optional(),concern:text(400).default('Business impact, evidence, and safeguards relevant to this role.'),
 personality:text(800).default('Professional, thoughtful, and evidence-focused.'),
 priorities:z.array(text(400)).max(6).default([]),concerns:z.array(text(400)).max(6).default([]),
 facts:z.array(text(700)).max(10).default([]),challenge_questions:z.array(text(400)).max(6).default([]),
 starters:z.array(text(300)).max(4).default(['What evidence would you need before using this workflow?'])
}).strict().transform(persona=>({...persona,initials:persona.initials||persona.name.split(/\s+/).map(word=>word[0]).slice(0,2).join('').toUpperCase()}));
export const personasSchema=z.array(personaSchema).length(2,'Provide exactly two stakeholders for this review.').refine(personas=>new Set(personas.map(persona=>persona.id)).size===2,'Stakeholder IDs must be unique.');
export const stakeholderConfigSchema=z.object({status:z.enum(['proposed','approved']),source:z.enum(['case_file','hiring_template','generated','sample']),proposal_id:z.string().uuid().optional(),personas:personasSchema}).strict().superRefine((config,ctx)=>{if(config.status==='proposed'&&(config.source!=='generated'||!config.proposal_id))ctx.addIssue({code:'custom',message:'Generated proposals require a proposal ID.'});});
export const caseStakeholdersSchema=z.union([stakeholderConfigSchema,personasSchema.transform(personas=>({status:'approved' as const,source:'case_file' as const,personas}))]);
export type StakeholderPersona=z.infer<typeof personaSchema>;
export type StakeholderConfig=z.infer<typeof stakeholderConfigSchema>;
