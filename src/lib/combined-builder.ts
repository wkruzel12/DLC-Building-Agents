import {z} from 'zod';
import {currentTest,stageOrder,type BuilderProgress,type StageTest} from './builder-progress';
import {decisionProblem,decisionSchema} from './decisions';
import {studentResult} from './results-learning';
import {runInput} from './run-input';
import type {ApplicantResult,Attempt,PublicScenario,Steps} from './types';

export const instructionFields=[
 {id:'extract',label:'Look For',question:'What information should your AI find?',description:'Tell your AI what information matters most when reviewing each record. Think about the qualifications, experience, skills, and supporting details that would help make a good decision.',guidance:'Be specific about what matters. The more clearly you identify the information to find, the easier it will be for your AI to evaluate the record.',placeholder:'Look for relevant work experience, education, analytical skills, and examples of measurable accomplishments.'},
 {id:'check',label:'Verify',question:'How should your AI check the information?',description:'Explain how your AI should confirm that the information it finds is accurate and meets the case requirements. Think about checking dates, comparing evidence against requirements, identifying measurable results, and using specific criteria.',guidance:'If a qualification requires a minimum score, date, experience level, or another measurable standard, explain how your AI should check it.',placeholder:'Verify that qualifications meet the case requirements and that experience claims are supported by specific evidence.'},
 {id:'flag',label:"Don't Include",question:'What should your AI ignore or flag?',description:'Identify information that should not influence the decision. Think about irrelevant details, unsupported claims, misleading information, and red flags that may require closer review.',guidance:'If the case includes a specific reason someone or something should be excluded, explain that rule here. Remember that information requiring review is not necessarily an automatic rejection.',placeholder:"Don't give credit for unsupported skills or unrelated experience. Flag missing required qualifications for further review."},
] as const;
export function combinedInstructions(steps:Steps){return instructionFields.map(field=>field.label.toUpperCase()+':\n'+steps[field.id]).join('\n\n');}
export function instructionProblems(steps:Steps){return instructionFields.flatMap(field=>steps[field.id].trim().length<10?[{id:field.id,message:`Write at least 10 characters in ${field.label}.`}]:steps[field.id].length>1500?[{id:field.id,message:`${field.label} exceeds the existing 1,500-character service limit. Shorten it before testing; your full draft is saved.`}]:[]);}

const stepsSchema=runInput.shape.steps;
const resultSchema=z.object({item_id:z.string(),label:z.string(),decision:z.union([decisionSchema,z.literal('error')]),match:z.boolean(),reason:z.string(),outputs:z.object({extract:z.string(),check:z.string(),flag:z.string()}),error:z.string().optional()});
const attemptSchema=z.object({id:z.string().min(1),attempt_number:z.number().int().nonnegative(),created_at:z.string().refine(value=>Number.isFinite(Date.parse(value))),steps:stepsSchema,results:z.array(resultSchema),accuracy:z.number().min(0).max(100),errors:z.number().int().nonnegative(),planted_caught:z.number().int().nonnegative(),planted_total:z.number().int().nonnegative(),mode:z.enum(['demo','openai'])}).passthrough();
export type IncompleteRun={message:string;results:ApplicantResult[]};
export type RunOutcome={kind:'complete';attempt:Attempt}|{kind:'incomplete';detail:IncompleteRun}|{kind:'failed'};

// Check the server's reported grade for consistency, never derive expected
// decisions or replace a missing grade with a locally invented score.
export function inspectRunResponse(body:unknown,scenario:PublicScenario,steps:Steps):Exclude<RunOutcome,{kind:'failed'}>{
 const parsed=attemptSchema.safeParse(body);
 const records=body&&typeof body==='object'&&Array.isArray((body as {results?:unknown}).results)?(body as {results:unknown[]}).results:[];
 const valid=records.flatMap(record=>{const row=resultSchema.safeParse(record);return row.success&&scenario.items.some(item=>item.id===row.data.item_id)?[studentResult(row.data)]:[];});
 const incomplete=():Exclude<RunOutcome,{kind:'failed'}>=>({kind:'incomplete',detail:{message:'This test returned incomplete or inconsistent results, so no reliable accuracy is available. Review the recorded evidence and retry. Your instructions are saved.',results:valid}});
 if(!parsed.success)return incomplete();
 const value=parsed.data;
 if(value.results.length!==scenario.items.length||new Set(value.results.map(row=>row.item_id)).size!==scenario.items.length||value.results.some(row=>!scenario.items.some(item=>item.id===row.item_id)))return incomplete();
 if(stageOrder.some(stage=>value.steps[stage]!==steps[stage].trim()))return incomplete();
 if(value.results.some(row=>row.decision==='error'?row.match||!row.error:row.error||decisionProblem(scenario,row.item_id,row.decision)))return incomplete();
 const correct=value.results.filter(row=>row.match).length,errors=value.results.filter(row=>row.decision==='error').length;
 if(value.accuracy!==Math.round(100*correct/scenario.items.length)||value.errors!==errors||value.planted_caught>value.planted_total||value.planted_total>scenario.items.length)return incomplete();
 return {kind:'complete',attempt:{...value,results:value.results.map(studentResult)} as Attempt};
}

const testSchema=z.object({id:z.string().min(1),stage:z.enum(stageOrder),record_id:z.string(),created_at:z.string(),expires_at:z.string(),output:z.string().min(1).max(12000),receipt:z.string().min(1).max(24000),steps:stepsSchema,upstream_ids:z.array(z.string()),decision:decisionSchema.optional(),reason:z.string().optional()});
export async function prepareAgentTests({caseId,scenario,steps,progress,request=fetch,onProgress}:{caseId:string;scenario:PublicScenario;steps:Steps;progress:BuilderProgress;request?:typeof fetch;onProgress:(progress:BuilderProgress)=>void}){
 let next=progress;
 for(const stage of stageOrder){
  if(currentTest(next,steps,stage))continue;
  const upstream=stageOrder.slice(0,stageOrder.indexOf(stage)).map(name=>currentTest(next,steps,name)!);
  const response=await request('/api/stage-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case_id:caseId,record_id:next.record_id,stage,steps,upstream:Object.fromEntries(upstream.map(test=>[test.stage,test.receipt])),request_id:crypto.randomUUID()})});
  if(!response.ok)throw Error(response.status===429?'AI testing is busy or its credits are unavailable. Wait a moment and try again.':response.status===401||response.status===403?'Your session needs attention. Sign in again before testing.':'The AI could not finish its readiness check. Try again shortly. Your instructions are saved.');
  const parsed=testSchema.safeParse(await response.json());
  if(!parsed.success)throw Error('The AI returned an incomplete readiness result. No graded test was started. Please retry.');
  const test=parsed.data as StageTest;
  if(test.stage!==stage||test.record_id!==next.record_id||!Number.isFinite(Date.parse(test.created_at))||Date.parse(test.expires_at)<=Date.now()||!Number.isFinite(Date.parse(test.expires_at))||stageOrder.some(name=>test.steps[name]!==steps[name].trim())||test.upstream_ids.length!==upstream.length||upstream.some((previous,i)=>test.upstream_ids[i]!==previous.id)||stage==='flag'&&(!test.decision||typeof test.reason!=='string'||decisionProblem(scenario,next.record_id,test.decision)))throw Error('The AI returned an invalid readiness result. No graded test was started. Please retry.');
  next={...next,tests:{...next.tests,[stage]:[test,...next.tests[stage]].slice(0,3)}};onProgress(next);
 }
 return next;
}
