import type {Decision,Steps} from './types';

export const stageOrder=['extract','check','flag'] as const;
export type StageName=typeof stageOrder[number];
export type StageTest={id:string;stage:StageName;record_id:string;created_at:string;expires_at:string;output:string;receipt:string;steps:Steps;upstream_ids:string[];decision?:Decision;reason?:string};
export type BuilderProgress={view:'intro'|StageName|'write'|'review'|'results';record_id:string;tests:Record<StageName,StageTest[]>};
export function freshProgress(record_id=''):BuilderProgress{return {view:'intro',record_id,tests:{extract:[],check:[],flag:[]}};}
export function currentTest(progress:BuilderProgress,steps:Steps,stage:StageName,now=Date.now()):StageTest|undefined{
 const index=stageOrder.indexOf(stage),upstream=stageOrder.slice(0,index).map(name=>currentTest(progress,steps,name,now));
 if(upstream.some(test=>!test))return;
 return progress.tests[stage].find(test=>test.record_id===progress.record_id&&Date.parse(test.expires_at)>now&&stageOrder.slice(0,index+1).every(name=>test.steps[name]===steps[name].trim())&&upstream.every((previous,i)=>test.upstream_ids[i]===previous!.id));
}
export function restoreProgress(input:unknown,recordIds:string[]):BuilderProgress{
 const fallback=freshProgress(recordIds[0]||'');
 if(!input||typeof input!=='object')return fallback;
 const value=input as BuilderProgress;
 if(!recordIds.includes(value.record_id)||!value.tests)return fallback;
 const tests=fallback.tests;
 for(const stage of stageOrder){
  tests[stage]=(Array.isArray(value.tests[stage])?value.tests[stage]:[]).filter(test=>test&&test.stage===stage&&recordIds.includes(test.record_id)&&typeof test.id==='string'&&typeof test.output==='string'&&test.output.length<=12000&&typeof test.receipt==='string'&&test.receipt.length<=24000&&Array.isArray(test.upstream_ids)&&test.steps&&stageOrder.every(name=>typeof test.steps[name]==='string'&&test.steps[name].length<=1500)&&Number.isFinite(Date.parse(test.expires_at))).slice(0,3);
 }
 return {view:['intro',...stageOrder,'write','review','results'].includes(value.view)?value.view:'intro',record_id:value.record_id,tests};
}
