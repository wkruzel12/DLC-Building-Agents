import sample from '../../scenarios/resume-screener.json';
import {classSummary,type ClassAttemptRow} from './class-analytics';
import {caseChecks,toEditable,toScenario,builderSetupSchema,editableCaseSchema} from './case-builder';
import {caseSchema} from './case-schema';
import {sameDecision} from './decisions';
import {normalizeJoinCode,JOIN_CODE_ALPHABET} from './roles';
import type {Attempt,Scenario,Steps} from './types';

export type WalkthroughRole='student'|'professor';
type DemoCase={scenario:Scenario;code:string;created:string;joined:boolean};
type Classroom={cases:DemoCase[];attempts:Attempt[]};
const key='proofwork.walkthrough.classroom.v1';
const sampleCase:DemoCase={scenario:sample as Scenario,code:'DEMQ2345',created:'2026-10-29T12:00:00Z',joined:false};
const created=()=>new Date().toISOString();

function classroom():Classroom{
 const saved=localStorage.getItem(key);
 return saved?JSON.parse(saved):{cases:[sampleCase],attempts:[]};
}

function reference(scenario:Scenario){
 const {id,title,story,task,requirements,decisions,decision_rules,skill_tags,items}=scenario;
 return {case_id:id,scenario:{id,title,story,task,requirements,decisions,decision_rules,skill_tags,items:items.map(({id,label,text})=>({id,label,text}))}};
}

export function walkthroughRequest(role:WalkthroughRole,target:number):typeof fetch{
 return async (input,init)=>{
  try{
   const url=new URL(String(input),window.location.origin),method=init?.method||'GET';
   const state=classroom(),body=typeof init?.body==='string'?JSON.parse(init.body):{};
   const save=()=>localStorage.setItem(key,JSON.stringify(state));
   const data=(value:unknown)=>Response.json(value);
   const error=(message:string,status=400)=>Response.json({error:message},{status});
   const selected=state.cases.find(entry=>entry.scenario.id===(body.case_id||url.searchParams.get('case_id')||url.pathname.split('/').at(-1)));
   if(url.pathname.startsWith('/api/instructor/')&&role!=='professor')return error('Switch to the professor demo.',403);
   switch(url.pathname){
    case '/api/instructor/cases': {
     if(method==='GET')return data(state.cases.map(({scenario,code,created,joined})=>({case_id:scenario.id,title:scenario.title,join_code:code,created_at:created,enrolled:Number(joined),records:scenario.items.length})));
     const edit=editableCaseSchema.parse(body.edit),setup=builderSetupSchema.parse(body.setup);
     if(!body.reviewed||caseChecks(edit,setup).some(check=>check.level==='error'))return error('Resolve the case checks and confirm the answer key.');
     const scenario=caseSchema.parse(toScenario(edit,setup,crypto.randomUUID()));
     let code:string;
     do{code=Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>JOIN_CODE_ALPHABET[n%JOIN_CODE_ALPHABET.length]).join('');}while(state.cases.some(entry=>entry.code===code));
     state.cases.unshift({scenario,code,created:created(),joined:false});save();
     return data({...reference(scenario),join_code:code});
    }
    case '/api/instructor/dashboard': {
     if(!selected)return error('Demo case unavailable.',404);
     const rows=state.attempts.filter(attempt=>attempt.case_id===selected.scenario.id).map(attempt=>({...attempt,user_id:'demo-student'})) as ClassAttemptRow[];
     return data({case_id:selected.scenario.id,title:selected.scenario.title,summary:classSummary(selected.scenario,rows,target,Number(selected.joined))});
    }
    case '/api/instructor/builder/generate':
     return data({case:toEditable(sampleCase.scenario)});
    case '/api/instructor/builder/analyze':
     return error('For this walkthrough, add learning outcomes manually. Uploaded materials are not sent to AI.');
    case '/api/instructor/guide':
     return data({reply:body.page==='create'?'Walkthrough example: Confirm a measurable learning outcome, then add a borderline record that requires a student to distinguish missing evidence from a failed requirement.':'Walkthrough example: Open Toughest records to find a good debrief topic. Ask students which piece of evidence would change their decision.'});
    case '/api/cases/join': {
     if(role!=='student')return error('Switch to the student demo.',403);
     const entry=state.cases.find(entry=>entry.code===normalizeJoinCode(String(body.code||'')));
     if(!entry)return error('No demo case matches that code.',404);
     entry.joined=true;save();return data(reference(entry.scenario));
    }
    case '/api/cases':
     return error('Use Create case to publish a fictional case for this walkthrough.');
    case '/api/history':
     return data(state.attempts.filter(attempt=>attempt.case_id===selected?.scenario.id));
    case '/api/stage-test': {
     const item=selected?.scenario.items.find(item=>item.id===body.record_id);
     if(!item)return error('Choose an existing demo record.');
     const id=crypto.randomUUID();
     const decision=selected?.scenario.answer_key.find(row=>row.item_id===item.id)?.decision;
     const output=body.stage==='extract'?item.text:body.stage==='check'?'Walkthrough example: compare the recorded evidence with the case criteria.':JSON.stringify({decision,reason:'Illustrative demo decision.'});
     return data({id,receipt:id,stage:body.stage,record_id:item.id,created_at:created(),expires_at:new Date(Date.now()+3600000).toISOString(),steps:trimSteps(body.steps),upstream_ids:Object.values(body.upstream||{}),output,...(body.stage==='flag'?{decision,reason:'Illustrative demo decision.'}:{})});
    }
    case '/api/run': {
     if(!selected||role!=='student')return error('Open a demo case as the student first.');
     const {scenario}=selected,steps=trimSteps(body.steps);
     const results=scenario.items.map(item=>{
      const expected=scenario.answer_key.find(row=>row.item_id===item.id)!;
      const decision=scenario.id==='resume-screener'&&item.id==='r04'&&!/human|ambigu/i.test(steps.flag)?'reject':expected.decision;
      const reason='Illustrative walkthrough result.';
      return {item_id:item.id,label:item.label,decision,match:sameDecision(decision,expected.decision),reason,outputs:{extract:item.text,check:'Compare this record with the case criteria.',flag:JSON.stringify({decision,reason})}};
     });
     const planted=scenario.answer_key.filter(row=>row.planted);
     const attempt:Attempt={id:crypto.randomUUID(),case_id:scenario.id,attempt_number:state.attempts.filter(row=>row.case_id===scenario.id).length+1,created_at:created(),steps,results,accuracy:Math.round(100*results.filter(row=>row.match).length/results.length),errors:0,planted_total:planted.length,planted_caught:planted.filter(row=>results.some(result=>result.item_id===row.item_id&&result.match)).length,mode:'demo',storage:'local'};
     state.attempts.unshift(attempt);save();return data(attempt);
    }
    case '/api/attempt-learning': {
     const attempt=state.attempts.find(row=>row.id===body.attempt_id&&row.case_id===body.case_id);
     if(!attempt)return error('Demo attempt unavailable.',404);
     const learning={reflection:String(body.reflection||''),acknowledged_below_target:body.acknowledged_below_target===true,updated_at:created()};
     attempt.learning=learning;save();return data(learning);
    }
    default:
     if(url.pathname.startsWith('/api/cases/')&&selected)return data(reference(selected.scenario));
     return error('This action is unavailable in the fictional walkthrough.',404);
   }
  }catch{return Response.json({error:'The walkthrough could not save or read the demo data in this browser.'},{status:400});}
 };
}

function trimSteps(steps:Steps):Steps{return {extract:steps.extract.trim(),check:steps.check.trim(),flag:steps.flag.trim()};}
