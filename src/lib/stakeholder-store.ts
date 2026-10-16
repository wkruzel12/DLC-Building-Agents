import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import type {Attempt} from './types';
import type {ReviewRecord,ReviewState} from './stakeholder-types';
import {localWorkspace,readLocalAttempt,reserveLocalMessage} from './stakeholder-local';
import {RunError} from './openai-errors';

export type ReviewAccess={local:boolean;owner:string};
export function reviewAdmin(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});}
export function initialReview(owner:string,caseId:string,attemptId:string,personaIds:string[]=['sarah','zack']):ReviewRecord{return {id:randomUUID(),user_id:owner,case_id:caseId,attempt_id:attemptId,state:{conversations:Object.fromEntries(personaIds.map(id=>[id,{id:randomUUID(),stakeholder_id:id,messages:[],request_ids:[]}])),reflection:null},version:0,lease_token:null,lease_until:new Date(0).toISOString()};}
const storageError=()=>new RunError('Stakeholder storage is unavailable. Apply supabase/stakeholders.sql and check the server configuration.',503);

export async function trustedAttempt(access:ReviewAccess,caseId:string,attemptId?:string):Promise<Attempt|null>{
 if(access.local)return readLocalAttempt(access.owner,caseId,attemptId);
 let query=reviewAdmin().from('attempts').select('id,attempt_number,created_at,steps,results,planted_caught,planted_total,accuracy,errors,mode').eq('user_id',access.owner).eq('scenario_id',caseId);
 if(attemptId)query=query.eq('id',attemptId);
 const {data,error}=await query.order('attempt_number',{ascending:false}).limit(1).maybeSingle();
 if(error)throw storageError();return data as Attempt|null;
}
export async function getReview(access:ReviewAccess,caseId:string,attemptId:string,personaIds:string[]=['sarah','zack']):Promise<ReviewRecord>{
 if(access.local)return localWorkspace(access.owner,workspace=>{let review=workspace.reviews.find(item=>item.attempt_id===attemptId&&item.case_id===caseId);if(!review){review=initialReview(access.owner,caseId,attemptId,personaIds);workspace.reviews.push(review);}return review;});
 const fresh=initialReview(access.owner,caseId,attemptId,personaIds);
 const {error:insertError}=await reviewAdmin().from('stakeholder_reviews').upsert(fresh,{onConflict:'user_id,attempt_id',ignoreDuplicates:true});
 if(insertError)throw storageError();
 const {data,error}=await reviewAdmin().from('stakeholder_reviews').select('*').eq('user_id',access.owner).eq('case_id',caseId).eq('attempt_id',attemptId).single();
 if(error||!data)throw storageError();return data as ReviewRecord;
}
export async function claimReview(access:ReviewAccess,review:ReviewRecord,token:string){
 const now=new Date().toISOString(),until=new Date(Date.now()+60000).toISOString();
 if(access.local)return localWorkspace(access.owner,workspace=>{const current=workspace.reviews.find(item=>item.id===review.id&&item.attempt_id===review.attempt_id);if(!current||current.user_id!==access.owner||current.version!==review.version||current.lease_until>now)throw new RunError('A conversation request is already running or this review changed. Reload and retry.',409);current.lease_token=token;current.lease_until=until;});
 const {data,error}=await reviewAdmin().from('stakeholder_reviews').update({lease_token:token,lease_until:until}).eq('id',review.id).eq('user_id',access.owner).eq('version',review.version).lte('lease_until',now).select('id').maybeSingle();
 if(error)throw storageError();if(!data)throw new RunError('A conversation request is already running or this review changed. Reload and retry.',409);
}
export async function commitReview(access:ReviewAccess,review:ReviewRecord,token:string,state:ReviewState){
 const update={state,version:review.version+1,lease_token:null,lease_until:new Date(0).toISOString()};
 if(access.local)return localWorkspace(access.owner,workspace=>{const index=workspace.reviews.findIndex(item=>item.id===review.id&&item.user_id===access.owner&&item.lease_token===token);if(index<0)throw new RunError('The conversation changed before it could be saved. Reload the review.',409);workspace.reviews[index]={...workspace.reviews[index],...update};return workspace.reviews[index];});
 const {data,error}=await reviewAdmin().from('stakeholder_reviews').update(update).eq('id',review.id).eq('user_id',access.owner).eq('lease_token',token).eq('version',review.version).select('*').maybeSingle();
 if(error)throw storageError();if(!data)throw new RunError('The conversation changed before it could be saved. Reload the review.',409);return data as ReviewRecord;
}
export async function releaseReview(access:ReviewAccess,review:ReviewRecord,token:string){
 if(access.local){await localWorkspace(access.owner,workspace=>{const current=workspace.reviews.find(item=>item.id===review.id&&item.lease_token===token);if(current){current.lease_token=null;current.lease_until=new Date(0).toISOString();}});return;}
 await reviewAdmin().from('stakeholder_reviews').update({lease_token:null,lease_until:new Date(0).toISOString()}).eq('id',review.id).eq('user_id',access.owner).eq('lease_token',token);
}
export async function reserveMessage(access:ReviewAccess){
 if(access.local)return reserveLocalMessage(access.owner);
 const {error}=await reviewAdmin().rpc('reserve_stakeholder_message',{p_user_id:access.owner});
 if(error){if(error.message.includes('MESSAGE_LIMIT'))throw new RunError('Message limit reached. Wait before sending again (12/minute, 120/hour).',429);throw storageError();}
}
