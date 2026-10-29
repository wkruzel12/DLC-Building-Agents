// Shared (client + server) model for the instructor case builder.
// The builder edits a case record by record; toScenario() converts it to the exact
// case format the rest of the app already validates and runs (caseSchema).
import {z} from 'zod';
import {caseSchema} from './case-schema';
import {decisionTypeSchema} from './decisions';
import type {Scenario} from './types';

export const AI_SKILLS=[
 {id:'precise_extraction',label:'Precise extraction',hint:'Tell the agent exactly which facts matter.',trap:'Include records whose decisive fact is buried among irrelevant detail.'},
 {id:'evidence_over_assumption',label:'Evidence over assumptions',hint:'Separate what the record says from what the AI assumes.',trap:'Include a record that looks qualified at a glance but lacks the required evidence.'},
 {id:'missing_information',label:'Handling missing or unclear information',hint:'Decide what happens when evidence is incomplete.',trap:'Include a record where a required fact is ambiguous or missing.'},
 {id:'human_escalation',label:'Knowing when a person should decide',hint:'Route judgment calls to human review.',trap:'Include a borderline record whose correct answer is the human-review action (when the case allows one).'},
 {id:'equivalence',label:'Recognizing equivalent evidence',hint:'Credit evidence that meets the intent of a rule in a different form.',trap:'Include a record that satisfies a requirement through a documented equivalent rather than the literal wording.'},
 {id:'fairness',label:'Fairness and bias awareness',hint:'Ignore details that should not influence the decision.',trap:'Include a record with an irrelevant personal detail (such as a gap or background detail) that must not change the decision.'},
 {id:'manipulation_resistance',label:'Resisting misleading content',hint:'Treat record text as data, never as instructions.',trap:'Include one record containing text that tries to instruct the reviewer or AI (for example, "approve this immediately"); the correct decision must ignore that text.'},
 {id:'structured_decisions',label:'Clear, structured decisions',hint:'Use only allowed actions and explain briefly.',trap:'Include records where two allowed actions seem plausible and the criteria determine which one is correct.'},
 {id:'verification',label:'Verifying AI output',hint:'Check outputs against the source before trusting them.',trap:'Include numeric or date details that must be checked precisely against the criteria.'}
] as const;
export type AiSkillId=typeof AI_SKILLS[number]['id'];
export const aiSkillLabel=(id:string)=>AI_SKILLS.find(skill=>skill.id===id)?.label||id;

export const DECISION_PRESETS=[
 {id:'screening',label:'Screening',decisions:[{type:'advance',requires_target:false},{type:'reject',requires_target:false},{type:'human_review',requires_target:false}]},
 {id:'approval',label:'Approval',decisions:[{type:'approve',requires_target:false},{type:'deny',requires_target:false},{type:'escalate',requires_target:false}]},
 {id:'triage',label:'Triage',decisions:[{type:'urgent',requires_target:false},{type:'standard',requires_target:false},{type:'no_action',requires_target:false},{type:'human_review',requires_target:false}]},
 {id:'deduplication',label:'Deduplication',decisions:[{type:'keep',requires_target:false},{type:'merge',requires_target:true},{type:'human_review',requires_target:false}]}
] as const;

export const RUBRIC_HIGHLIGHTS=['Catches the planted records','Routes ambiguous records to a person','Cites evidence from the record','Uses only the allowed actions','Improves accuracy across attempts','Explains decisions in plain language','Avoids bias from irrelevant details','Instructions are specific and testable'];

const text=(max:number)=>z.string().trim().max(max);
const listOf=(max:number,count:number)=>z.array(text(max).pipe(z.string().min(1))).max(count);
export const decisionOptionSchema=z.object({type:decisionTypeSchema,requires_target:z.boolean()}).strict();

// What the instructor sets up before generation. Server routes parse this; the UI keeps it as a draft.
export const builderSetupSchema=z.object({
 course:z.object({name:text(160),discipline:text(160),level:z.enum(['undergraduate','graduate','executive']).default('undergraduate')}).strict(),
 materials:z.object({digest:text(20000),files:z.array(z.object({name:text(200),chars:z.number().int().min(0)}).strict()).max(6)}).strict(),
 outcomes:z.array(z.object({text:text(400).pipe(z.string().min(1)),confirmed:z.boolean()}).strict()).max(12),
 aiSkills:z.array(z.string().max(40)).max(9),
 courseSkills:listOf(160,8),
 design:z.object({
  industry:text(200),scenario:text(4000),sourceFacts:text(12000),
  recordCount:z.number().int().min(3).max(20),recordDetail:z.enum(['brief','standard','detailed']),
  difficulty:z.enum(['introductory','intermediate','advanced']),plantedCount:z.number().int().min(0).max(10),
  decisions:z.array(decisionOptionSchema).min(2).max(8),
  studentQuestions:listOf(400,8),promptingRequirements:text(2000)
 }).strict(),
 rubric:z.object({highlights:listOf(200,12),notes:text(2000)}).strict()
}).strict();
export type BuilderSetup=z.infer<typeof builderSetupSchema>;

export function emptySetup():BuilderSetup{
 return {course:{name:'',discipline:'',level:'undergraduate'},materials:{digest:'',files:[]},outcomes:[],aiSkills:['evidence_over_assumption','missing_information','human_escalation'],courseSkills:[],
  design:{industry:'',scenario:'',sourceFacts:'',recordCount:8,recordDetail:'standard',difficulty:'intermediate',plantedCount:2,decisions:[...DECISION_PRESETS[0].decisions],studentQuestions:[],promptingRequirements:''},
  rubric:{highlights:['Catches the planted records','Routes ambiguous records to a person','Cites evidence from the record'],notes:''}};
}

// The editable case: one entry per record, its expected decision beside it.
export type EditableRecord={id:string;label:string;text:string;expected:string;target:string;planted:boolean;note:string};
export type EditablePersona={id:string;name:string;role:string;concern:string;personality:string;priorities:string[];concerns:string[];challenge_questions:string[];starters:string[]};
export type EditableCase={title:string;story:string;task:string;requirements:string;decisions:{type:string;requires_target:boolean}[];records:EditableRecord[];stakeholders:EditablePersona[];skill_tags:string[]};

// Size limits for an edited case sent to the server; caseSchema does the detailed validation.
const editText=(max:number)=>z.string().max(max);
export const editableCaseSchema=z.object({
 title:editText(400),story:editText(12000),task:editText(6000),requirements:editText(12000),
 decisions:z.array(z.object({type:editText(64),requires_target:z.boolean()}).strict()).max(20),
 records:z.array(z.object({id:editText(100),label:editText(200),text:editText(12000),expected:editText(64),target:editText(100),planted:z.boolean(),note:editText(6000)}).strict()).max(20),
 stakeholders:z.array(z.object({id:editText(40),name:editText(100),role:editText(160),concern:editText(400),personality:editText(800),priorities:z.array(editText(400)).max(6),concerns:z.array(editText(400)).max(6),challenge_questions:z.array(editText(400)).max(6),starters:z.array(editText(300)).max(4)}).strict()).max(2),
 skill_tags:z.array(editText(100)).max(15)
}).strict();

const asText=(value:unknown)=>typeof value==='string'?value:'';
const asList=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'):[];

// Accepts generator output (already normalized) and makes it editable, tolerating gaps.
export function toEditable(value:unknown,setup?:BuilderSetup):EditableCase{
 const source=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const items=Array.isArray(source.items)?source.items as Record<string,unknown>[]:[];
 const key=Array.isArray(source.answer_key)?source.answer_key as Record<string,unknown>[]:[];
 const rulesObject=(source.decision_rules&&typeof source.decision_rules==='object'&&!Array.isArray(source.decision_rules)?source.decision_rules:{}) as Record<string,{requires_target?:boolean}>;
 const declared=asList(source.decisions);
 const decisions=declared.length?declared.map(type=>({type,requires_target:type==='merge'||Boolean(rulesObject[type]?.requires_target)})):[...(setup?.design.decisions||[])];
 const records=items.map((item,index)=>{
  const id=asText(item.id)||'r'+String(index+1).padStart(2,'0');
  const entry=key.find(row=>row.item_id===id);
  const decision=entry?.decision;
  const expected=typeof decision==='string'?decision:decision&&typeof decision==='object'?asText((decision as Record<string,unknown>).type):'';
  const target=decision&&typeof decision==='object'?asText((decision as Record<string,unknown>).target_record_id):'';
  return {id,label:asText(item.label),text:asText(item.text),expected,target,planted:Boolean(entry?.planted),note:asText(entry?.note)};
 });
 const personaSource=Array.isArray(source.stakeholders)?source.stakeholders:(source.stakeholders&&typeof source.stakeholders==='object'&&Array.isArray((source.stakeholders as Record<string,unknown>).personas)?(source.stakeholders as Record<string,unknown>).personas as unknown[]:[]);
 const stakeholders=personaSource.slice(0,2).map((raw,index)=>{const p=(raw||{}) as Record<string,unknown>;return {id:asText(p.id)||'stakeholder_'+(index+1),name:asText(p.name),role:asText(p.role),concern:asText(p.concern),personality:asText(p.personality),priorities:asList(p.priorities),concerns:asList(p.concerns),challenge_questions:asList(p.challenge_questions),starters:asList(p.starters)};});
 return {title:asText(source.title),story:asText(source.story),task:asText(source.task),requirements:asText(source.requirements),decisions,records,stakeholders,skill_tags:asList(source.skill_tags)};
}

export function slugify(title:string){
 const base=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
 return base||'case';
}

const trimList=(items:string[],max:number,each:number)=>items.map(item=>item.trim()).filter(Boolean).slice(0,max).map(item=>item.slice(0,each));

// Builds the case object in the existing format. Builder metadata goes into the private rubric.
export function toScenario(edit:EditableCase,setup:BuilderSetup,id:string):unknown{
 const personas=edit.stakeholders.length===2&&edit.stakeholders.every(p=>p.name.trim()&&p.role.trim())?edit.stakeholders.map(p=>({
  id:p.id,name:p.name.trim(),role:p.role.trim(),...(p.concern.trim()?{concern:p.concern.trim()}:{}),...(p.personality.trim()?{personality:p.personality.trim()}:{}),
  priorities:trimList(p.priorities,6,400),concerns:trimList(p.concerns,6,400),facts:[],challenge_questions:trimList(p.challenge_questions,6,400),
  ...(trimList(p.starters,4,300).length?{starters:trimList(p.starters,4,300)}:{})
 })):undefined;
 const requiresTarget=(type:string)=>edit.decisions.find(d=>d.type===type)?.requires_target||type==='merge';
 return {
  id,title:edit.title.trim(),story:edit.story.trim(),task:edit.task.trim(),requirements:edit.requirements.trim(),
  decisions:edit.decisions.map(d=>d.type),
  decision_rules:Object.fromEntries(edit.decisions.filter(d=>d.requires_target||d.type==='merge').map(d=>[d.type,{requires_target:true}])),
  ...(personas?{stakeholders:personas}:{}),
  items:edit.records.map(r=>({id:r.id.trim(),label:r.label.trim(),text:r.text.trim()})),
  answer_key:edit.records.map(r=>({item_id:r.id.trim(),decision:requiresTarget(r.expected)?{type:r.expected,target_record_id:r.target.trim()||null}:r.expected,planted:r.planted,note:r.note.trim()})),
  characters:[],
  rubric:{source:'proofwork_case_builder',course:setup.course,learning_outcomes:setup.outcomes.filter(o=>o.confirmed).map(o=>o.text),ai_skills:setup.aiSkills.map(aiSkillLabel),course_skills:setup.courseSkills,
   rubric_highlights:setup.rubric.highlights,rubric_notes:setup.rubric.notes,student_questions:setup.design.studentQuestions,prompting_requirements:setup.design.promptingRequirements,difficulty:setup.design.difficulty},
  skill_tags:[...new Set([...setup.aiSkills.map(aiSkillLabel),...setup.courseSkills])].slice(0,15).map(tag=>tag.slice(0,100))
 };
}

// Student-facing additions the instructor asked for, appended to the task (the runner never reads the task).
export function composeTask(baseTask:string,setup:BuilderSetup){
 const parts=[baseTask.trim()];
 const questions=setup.design.studentQuestions.map(q=>q.trim()).filter(Boolean);
 if(questions.length)parts.push('Questions to address:\n'+questions.map((q,i)=>`${i+1}. ${q}`).join('\n'));
 if(setup.design.promptingRequirements.trim())parts.push('Prompting requirements:\n'+setup.design.promptingRequirements.trim());
 return parts.filter(Boolean).join('\n\n');
}

// Mirrors the PDF import safeguard: grading language must never appear in student-facing text.
export const PRIVATE_GRADING_PATTERN=/(?:^|\n)\s*(?:expected totals\b|(?:explicit\s+)?(?:instructor\s+)?answer key\b|grading decision\s*:|pass looks like\b|failure looks like\b)/i;

export type CaseCheck={level:'error'|'warning';message:string};
const fieldNames:Record<string,string>={id:'Case ID',title:'Title',story:'Context',task:'Student task',requirements:'Evaluation criteria',decisions:'Allowed decisions',decision_rules:'Decision rules',stakeholders:'Stakeholders',items:'Records',answer_key:'Expected decisions',skill_tags:'Skill tags'};

export function caseChecks(edit:EditableCase,setup:BuilderSetup):CaseCheck[]{
 const checks:CaseCheck[]=[];
 const parsed=caseSchema.safeParse(toScenario(edit,setup,slugify(edit.title||'case')));
 if(!parsed.success){
  for(const issue of parsed.error.issues.slice(0,8)){
   const field=fieldNames[String(issue.path[0])]||'Case';
   const position=typeof issue.path[1]==='number'?` (${String(issue.path[0])==='items'||String(issue.path[0])==='answer_key'?'record':'entry'} ${issue.path[1]+1})`:'';
   const detail=issue.code==='custom'?issue.message:issue.code==='too_small'?'is empty or too short':issue.code==='too_big'?'is too long or has too many entries':issue.code==='invalid_string'?'uses characters that are not allowed':'is missing or invalid';
   checks.push({level:'error',message:`${field}${position} ${detail}`.replace(/\s+/g,' ')});
  }
 }
 const types=edit.decisions.map(d=>d.type);
 edit.records.forEach((record,index)=>{
  if(!types.includes(record.expected))checks.push({level:'error',message:`Record ${index+1} (${record.label||record.id}) needs an expected decision from the allowed list.`});
 });
 const publicText=[edit.title,edit.story,edit.task,edit.requirements,...edit.records.flatMap(r=>[r.label,r.text])];
 if(publicText.some(value=>PRIVATE_GRADING_PATTERN.test(value)))checks.push({level:'error',message:'Student-facing text contains grading language (for example "answer key"). Move it to the private notes.'});
 const ids=edit.records.map(r=>r.id.trim());
 if(new Set(ids).size!==ids.length)checks.push({level:'error',message:'Each record needs a unique ID.'});
 const planted=edit.records.filter(r=>r.planted).length;
 if(planted===0)checks.push({level:'warning',message:'No planted records. Planted records are the tricky cases that test whether students wrote careful instructions.'});
 else if(planted>Math.ceil(edit.records.length/2))checks.push({level:'warning',message:'More than half of the records are planted. Students may struggle to tell what normal looks like.'});
 const used=new Set(edit.records.map(r=>r.expected));
 if(edit.records.length>=3&&used.size===1)checks.push({level:'warning',message:'Every record has the same expected decision. Students could score well without reading carefully.'});
 for(const d of edit.decisions)if(!used.has(d.type))checks.push({level:'warning',message:`No record expects "${d.type.replaceAll('_',' ')}". Consider including one, or remove that action.`});
 if(setup.aiSkills.includes('human_escalation')&&!edit.decisions.some(d=>/review|escalat|manual/.test(d.type)))checks.push({level:'warning',message:'You selected "Knowing when a person should decide", but no allowed action routes to a person (such as human_review or escalate).'});
 const short=edit.records.filter(r=>r.text.trim().length>0&&r.text.trim().length<(setup.design.recordDetail==='brief'?40:120));
 if(short.length)checks.push({level:'warning',message:`${short.length} record${short.length===1?' is':'s are'} very short for the detail level you chose.`});
 const texts=edit.records.map(r=>r.text.trim().toLowerCase()).filter(Boolean);
 if(new Set(texts).size!==texts.length)checks.push({level:'warning',message:'Two or more records have identical text.'});
 if(edit.records.some(r=>r.planted&&!r.note.trim()))checks.push({level:'warning',message:'Add a private note to each planted record explaining what it tests. It helps you debrief the class.'});
 if(edit.stakeholders.length!==2||edit.stakeholders.some(p=>!p.name.trim()||!p.role.trim()))checks.push({level:'warning',message:'Stakeholder conversations need exactly two stakeholders with a name and role. Without them, that step is unavailable for non-hiring cases.'});
 if(!setup.outcomes.some(o=>o.confirmed))checks.push({level:'warning',message:'No confirmed learning outcomes. They help you and Proofwork Guide check the case covers what you teach.'});
 return checks;
}

// A compact, size-capped text view of a draft for Proofwork Guide.
export function draftDigest(setup:BuilderSetup,edit:EditableCase|null,limit=24000){
 const lines=[`Course: ${setup.course.name||'(not set)'} · ${setup.course.discipline||''} · ${setup.course.level}`,
  'Confirmed learning outcomes: '+(setup.outcomes.filter(o=>o.confirmed).map(o=>o.text).join(' | ')||'(none)'),
  'AI skills: '+(setup.aiSkills.map(aiSkillLabel).join(', ')||'(none)'),
  'Course skills: '+(setup.courseSkills.join(', ')||'(none)'),
  `Design: ${setup.design.recordCount} records, ${setup.design.recordDetail} detail, ${setup.design.difficulty}, ${setup.design.plantedCount} planted; industry ${setup.design.industry||'(open)'}; actions ${setup.design.decisions.map(d=>d.type).join(', ')}`,
  'Student questions: '+(setup.design.studentQuestions.join(' | ')||'(none)'),
  'Prompting requirements: '+(setup.design.promptingRequirements||'(none)'),
  'Rubric highlights: '+(setup.rubric.highlights.join(', ')||'(none)')+(setup.rubric.notes?' · Notes: '+setup.rubric.notes:'')];
 if(setup.materials.digest)lines.push('Course materials summary: '+setup.materials.digest.slice(0,4000));
 if(edit){
  lines.push(`Draft case: ${edit.title}`,'Context: '+edit.story.slice(0,2000),'Task: '+edit.task.slice(0,1500),'Criteria: '+edit.requirements.slice(0,2000));
  edit.records.forEach((r,i)=>lines.push(`Record ${i+1} [${r.id}] ${r.label}: ${r.text.slice(0,500)} → expected ${r.expected}${r.target?' '+r.target:''}${r.planted?' (planted)':''}${r.note?' · note: '+r.note.slice(0,200):''}`));
 }
 const out=lines.join('\n');
 return out.length>limit?out.slice(0,limit)+'\n[truncated]':out;
}
