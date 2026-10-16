import 'server-only';
import type {Attempt,Scenario} from './types';
import type {AttemptLearning} from './results-learning';
import {emptyLearning,studentAttempt,validReflection} from './results-learning';
import {learningTarget} from './learning-config';
import {localWorkspace} from './stakeholder-local';
import {reviewAdmin,trustedAttempt,type ReviewAccess} from './stakeholder-store';
import {RunError} from './openai-errors';

const unavailable=()=>new RunError('Learning history storage is unavailable. Apply supabase/results-learning.sql and check the server configuration.',503);
export async function completedCount(access:ReviewAccess,caseId:string,before?:string){
 if(access.local)return localWorkspace(access.owner,w=>w.attempts.filter(item=>item.case_id===caseId&&(!before||item.created_at<=before)).length);
 let query=reviewAdmin().from('attempts').select('id',{count:'exact',head:true}).eq('user_id',access.owner).eq('scenario_id',caseId);
 if(before)query=query.lte('created_at',before);
 const {count,error}=await query;if(error)throw unavailable();return count||0;
}
export async function readLearning(access:ReviewAccess,caseId:string,attemptId:string):Promise<AttemptLearning>{
 if(access.local)return localWorkspace(access.owner,w=>w.attempts.some(a=>a.id===attemptId&&a.case_id===caseId)?w.learning?.[attemptId]||emptyLearning():emptyLearning());
 const {data,error}=await reviewAdmin().from('attempt_learning').select('reflection,acknowledged_below_target,coaching,updated_at').eq('user_id',access.owner).eq('case_id',caseId).eq('attempt_id',attemptId).maybeSingle();
 if(error)throw unavailable();return data?{...data,coaching:data.coaching||undefined}:emptyLearning();
}
export async function writeLearning(access:ReviewAccess,caseId:string,attemptId:string,patch:Partial<AttemptLearning>){
 // Never accept a client attempt, score, or owner as evidence of ownership.
 const attempt=await trustedAttempt(access,caseId,attemptId);if(!attempt)throw new RunError('Attempt unavailable or access denied.',404);
 const updated_at=new Date().toISOString();
 if(access.local)return localWorkspace(access.owner,w=>{if(!w.attempts.some(a=>a.id===attemptId&&a.case_id===caseId))throw new RunError('Attempt unavailable.',404);w.learning||={};return w.learning[attemptId]={...emptyLearning(),...w.learning[attemptId],...patch,updated_at};});
 const {data,error}=await reviewAdmin().from('attempt_learning').upsert({attempt_id:attemptId,user_id:access.owner,case_id:caseId,...patch,updated_at},{onConflict:'attempt_id'}).select('reflection,acknowledged_below_target,coaching,updated_at').single();
 if(error||!data)throw unavailable();return {...data,coaching:data.coaching||undefined} as AttemptLearning;
}
export async function requireReflection(access:ReviewAccess,caseId:string){
 const latest=await trustedAttempt(access,caseId);if(!latest||latest.accuracy>=learningTarget())return;
 const learning=await readLearning(access,caseId,latest.id);
 if(!validReflection(learning.reflection))throw new RunError('Before another full simulation, save a brief reflection on your latest attempt in Feedback & Results → Improve.',409);
}
export async function learningAttempt(access:ReviewAccess,caseId:string,attempt:Attempt):Promise<Attempt>{
 const [learning,index,count]=await Promise.all([readLearning(access,caseId,attempt.id),completedCount(access,caseId,attempt.created_at),completedCount(access,caseId)]);
 return {...studentAttempt(attempt),completed_index:Math.max(1,index),completed_count:count,learning};
}
export async function learningHistory(access:ReviewAccess,caseId:string,attempts:Attempt[]){
 if(!attempts.length)return [];
 const ordered=[...attempts].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.attempt_number-a.attempt_number);
 if(access.local)return localWorkspace(access.owner,w=>{const all=w.attempts.filter(a=>a.case_id===caseId).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.attempt_number-b.attempt_number);return ordered.map(a=>({...studentAttempt(a),completed_index:all.findIndex(row=>row.id===a.id)+1,completed_count:all.length,learning:w.learning?.[a.id]||emptyLearning()}));});
 const [count,response]=await Promise.all([completedCount(access,caseId),reviewAdmin().from('attempt_learning').select('attempt_id,reflection,acknowledged_below_target,coaching,updated_at').eq('user_id',access.owner).eq('case_id',caseId).in('attempt_id',ordered.map(a=>a.id))]);
 if(response.error)throw unavailable();
 const notes=new Map<string,AttemptLearning>((response.data||[]).map(row=>[row.attempt_id,{reflection:row.reflection,acknowledged_below_target:row.acknowledged_below_target,coaching:row.coaching||undefined,updated_at:row.updated_at}]));
 return ordered.map((a,index)=>({...studentAttempt(a),completed_index:count-index,completed_count:count,learning:notes.get(a.id)||emptyLearning()}));
}
