import 'server-only';
import {caseSchema} from './case-schema';
import {RunError} from './openai-errors';

export class PdfImportError extends RunError {
 constructor(message:string,public phase:'extraction'|'validation',public code:string,public issues:string[]=[]){super(message,422);}
}

// Normalize source spelling into reusable action IDs, never into another outcome.
export function normalizePdfDecisions(value:unknown):unknown {
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const source=value as Record<string,unknown>;
 const action=(label:unknown)=>{
  if(typeof label!=='string')return label;
  const text=label.trim().toLowerCase();
  if(/^merge(?:\s+into\b.*)?$/.test(text))return 'merge';
  return text.replace(/[\s-]+/g,'_');
 };
 const normalize=(label:unknown):unknown=>{
  if(typeof label==='string'){
   const merge=label.trim().match(/^merge\s+into\s+(.+)$/i);
   return merge?{type:'merge',target_record_id:merge[1].trim()}:action(label);
  }
  if(label&&typeof label==='object'&&!Array.isArray(label)){
   const decision=label as Record<string,unknown>;
   const merge=typeof decision.type==='string'?decision.type.trim().match(/^merge\s+into\s+(.+)$/i):null;
   if(merge){
    const target=merge[1].trim();
    // Never discard an inline target or choose between conflicting targets.
    if(decision.target_record_id!=null&&decision.target_record_id!==target)return decision;
    return {...decision,type:'merge',target_record_id:target};
   }
   return {...decision,type:action(decision.type)};
  }
  return label;
 };
 let rules=source.decision_rules;
 if(Array.isArray(rules)&&rules.every(rule=>rule&&typeof rule==='object'&&typeof rule.type==='string'&&typeof rule.requires_target==='boolean')&&new Set(rules.map(rule=>action(rule.type))).size===rules.length){
  rules=Object.fromEntries(rules.map(rule=>[action(rule.type),{requires_target:rule.requires_target}]));
 }else if(rules&&typeof rules==='object'&&!Array.isArray(rules)){
  const entries=Object.entries(rules);
  // A collision may conceal conflicting rules; leave it invalid for correction.
  if(new Set(entries.map(([type])=>action(type))).size===entries.length)rules=Object.fromEntries(entries.map(([type,rule])=>[action(type),rule]));
 }
 return {...source,
  ...(Array.isArray(source.stakeholders)&&source.stakeholders.length===0?{stakeholders:undefined}:{}),
  decisions:Array.isArray(source.decisions)?source.decisions.map(action):source.decisions,
  ...(rules!==undefined?{decision_rules:rules}:{}),
  answer_key:Array.isArray(source.answer_key)?source.answer_key.map(entry=>entry&&typeof entry==='object'&&!Array.isArray(entry)?{...entry,decision:normalize(entry.decision)}:entry):source.answer_key
 };
}

// Diagnostics contain fixed schema descriptions, never document values or grading notes.
const fields:Record<string,string>={id:'case ID',title:'title',story:'context/background',task:'objective/task',requirements:'evaluation criteria',decisions:'allowed decision types',decision_rules:'decision target rules',items:'records (1–20, with unique IDs and nonempty text)',answer_key:'private grading key (one unambiguous decision per record)',skill_tags:'skill tags'};
export function validatePdfCase(value:unknown){
 const result=caseSchema.safeParse(value);
 if(result.success){
  const scenario=result.data;
  const publicTexts=[scenario.title,scenario.story,scenario.task,scenario.requirements,...scenario.skill_tags,...scenario.items.flatMap(item=>[item.label,item.text])];
  // Source documents often place a solutions summary beside ordinary criteria.
  // Stop publication rather than trusting a model to redact every annotation.
  const gradingSection=/(?:^|\n)\s*(?:expected totals\b|(?:explicit\s+)?(?:instructor\s+)?answer key\b|grading decision\s*:|pass looks like\b|failure looks like\b)/i;
  if(publicTexts.some(text=>gradingSection.test(text)))throw new PdfImportError('PDF extraction placed a private grading section in student-facing content. Import was stopped before publication. Retry import, or have an instructor remove grading annotations from public fields using private case setup.','extraction','pdf_grading_redaction_failed');
  return scenario;
 }
 const names=[...new Set(result.error.issues.map(issue=>String(issue.path[0]||'case')))];
 const gradingOnly=names.every(name=>name==='answer_key');
 throw new PdfImportError(
  gradingOnly?'PDF content was extracted, but the private grading key is missing, incomplete, or inconsistent. An instructor must supply or correct the key using the private case-setup tool before uploading the completed JSON. No answers were invented.':'PDF content was extracted, but case validation failed. Check the fields listed below; headings may use different names.',
  'validation',gradingOnly?'grading_setup_required':'case_schema_invalid',
  result.error.issues.map(issue=>{
   const field=fields[String(issue.path[0])]||'case structure';
   const position=typeof issue.path[1]==='number'?` (entry ${issue.path[1]+1})`:'';
   const detail=issue.code==='custom'?issue.message:
    issue.code==='too_small'?'Required content is empty or below the minimum.':
    issue.code==='too_big'?'Content exceeds the permitted size or count.':
    issue.code==='invalid_enum_value'?'Unsupported decision label.':
    issue.code==='invalid_string'?'Action IDs must start with a lowercase letter and contain only lowercase letters, numbers, or underscores; case IDs use letters, numbers, hyphens, or underscores.':
    issue.code==='invalid_union'?'Provide exactly one decision: an action ID or {type, target_record_id}. The type must be a lowercase action ID (up to 64 characters); a target must be a nonempty record ID or null. Arrays and combined alternatives are not valid decisions.':
    issue.code==='unrecognized_keys'?'Unexpected fields; a decision accepts only type and target_record_id.':'Required content is missing or has the wrong type.';
   const nested=issue.path.slice(typeof issue.path[1]==='number'?2:1).filter(part=>['decision','type','target_record_id','requires_target','item_id'].includes(String(part)));
   return `${field}${position}${nested.length?` (${nested.join('.')})`:''}: ${detail}`;
  })
 );
}
