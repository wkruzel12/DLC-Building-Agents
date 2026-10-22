import type {ApplicantResult,Attempt,PublicScenario} from './types';
import {presentOutput,outputLabel,type OutputValue} from './output-presentation';

// Explicit teaching references for the public sample only. Never import its private answer key.
const sample={
 r01:{source:'Priya S. BA Economics, 2025. Internship: analytics assistant, used SQL for reporting and Excel pivot tables. Presented weekly findings to cross-functional teams.',evidence:['A bachelor’s degree in Economics.','SQL reporting and Excel pivot tables in an analytics internship.','Weekly presentations to cross-functional teams.'],connection:'The record provides education, technical, and communication evidence.',goal:'Advance for this sample case.',why:'Connect the stated qualifications to the requirements without adding new requirements.',hint:'Keep the clear evidence checks. Compare the records needing review to find what to clarify.'},
 r02:{source:'Jordan M. No four-year degree. Completed a rigorous two-year data apprenticeship and worked 3 years as reporting analyst. Advanced SQL, Excel Power Query, and client presentations. Experience may be equivalent to a degree.',evidence:['A rigorous two-year data apprenticeship.','Three years as a reporting analyst.','Advanced SQL, Excel Power Query, and client presentations.'],connection:'Relevant professional experience can satisfy this case’s degree-or-equivalent requirement.',goal:'Advance for this sample case.',why:'Recognize relevant experience alongside technical and communication evidence instead of rejecting solely for the missing degree.',hint:'Make the next version clearer about equivalent experience. Keep your own wording.'},
 r03:{source:'Alex T. BA History, 2026. Retail cashier. Comfortable with email and word processing, no SQL or Excel analysis projects stated.',evidence:['A bachelor’s degree in History.','Email and word processing do not demonstrate SQL or Excel analysis.','No SQL or Excel analysis projects are stated.'],connection:'A degree alone does not establish the required technical skills.',goal:'Reject for this sample case.',why:'Assess every required skill and do not give credit for evidence the resume does not provide.',hint:'Distinguish a stated qualification from an unsupported assumption.'},
 r04:{source:"Sam R. BS Business, 2025. Built advanced Excel models. Lists 'database tools' without naming SQL. Good communication experience; SQL proficiency cannot be determined from resume.",evidence:['A Business degree, advanced Excel models, and communication experience.','“Database tools” are listed without naming SQL.','SQL proficiency is unclear; it is not established either way.'],connection:'Unclear SQL evidence calls for human review under the case requirements.',goal:'Refer for human review.',why:'Flag the uncertainty and request clarification instead of guessing or automatically rejecting.',hint:'Clarify how to handle ambiguous evidence and when to use human review.'},
 r05:{source:'Morgan L. BS Statistics, 2026. SQL queries, Excel dashboards, campus consulting projects, and client presentations. Career break for caregiving in 2024.',evidence:['A bachelor’s degree in Statistics.','SQL queries, Excel dashboards, and client presentations.','A caregiving break that is unrelated to the stated qualification requirements.'],connection:'The caregiving break does not change the evidence of meeting the case requirements.',goal:'Advance for this sample case.',why:'Use relevant qualifications and leave unrelated personal circumstances out of the recommendation.',hint:'Keep the focus on job-related evidence and exclude irrelevant personal details.'}
} as const;
const requirements="Bachelor's degree or equivalent relevant experience; demonstrated Excel and SQL skills; strong communication. Refer ambiguous qualifications to human review rather than guessing.";
export function sampleReference(scenario:PublicScenario|undefined,records:Attempt['records'],id:string){
 if(!scenario||scenario.id!=='resume-screener'||scenario.requirements!==requirements||scenario.task!=='Write a three-stage agent that extracts qualifications, checks them against the role, and makes a responsible recommendation for each candidate.')return null;
 const rows=records||scenario.items;
 if(rows.length!==5||Object.entries(sample).some(([key,value])=>rows.find(row=>row.id===key)?.text!==value.source)||scenario.items.length!==5||Object.entries(sample).some(([key,value])=>scenario.items.find(row=>row.id===key)?.text!==value.source))return null;
 return Object.hasOwn(sample,id)?sample[id as keyof typeof sample]:null;
}
// Convert recorded output to readable evidence without interpreting a grade or inventing missing facts.
export function readableEvidence(raw:string|undefined):string[]{
 if(!raw?.trim())return [];
 const output=presentOutput(raw);
 function flatten(value:OutputValue,label=''):string[]{
  if(value.kind==='object')return value.fields.flatMap(field=>flatten(field.value,outputLabel(field.key)));
  if(value.kind==='array')return value.items.flatMap(item=>flatten(item,label));
  const text=value.kind==='null'?'Not provided':value.kind==='boolean'?String(value.value):value.text;
  return [label?label+': '+text:text];
 }
 const text=output.kind==='structured'?flatten(output.value).join('\n'):output.kind==='text'?output.text:'';
 return text.replace(/```[^\n]*\n?|```/g,'').replace(/\*\*|^#{1,6}\s+/gm,'').split(/\n+/).map(line=>line.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
}
export function recordEvidence(attempt:Attempt,result:ApplicantResult){
 if(attempt.mode==='demo'){
  const original=attempt.records?.find(row=>row.id===result.item_id)?.text;
  const saved=result.outputs.extract?.replace(/^Demo extraction for [^\n]*?:\s*/,'');
  return {simulated:true,lines:readableEvidence(original||saved)};
 }
 return {simulated:false,lines:readableEvidence(result.outputs.extract)};
}
