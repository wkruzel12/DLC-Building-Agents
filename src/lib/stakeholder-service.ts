import 'server-only';
import {randomUUID} from 'node:crypto';
import type {z} from 'zod';
import type {Attempt,Scenario} from './types';
import type {chatInput,ReviewRecord,ReviewResponse} from './stakeholder-types';
import {performanceSummary,publicPersonas} from './stakeholder-context';
import {stakeholderReply,stakeholderReflection} from './stakeholder-model';
import {claimReview,commitReview,releaseReview,reserveMessage,type ReviewAccess} from './stakeholder-store';
import {RunError} from './openai-errors';

export function publicReview(review:ReviewRecord,scenario:Scenario,attempt:Attempt,local:boolean):ReviewResponse{
 const {sarah,zack}=review.state.conversations;
 const publicThread=({id,stakeholder_id,messages}:typeof sarah)=>({id,stakeholder_id,messages});
 return {review_id:review.id,attempt:performanceSummary(scenario,attempt),personas:publicPersonas(scenario),conversations:{sarah:publicThread(sarah),zack:publicThread(zack)},reflection:review.state.reflection,version:review.version,local};
}
export async function performReviewAction(access:ReviewAccess,scenario:Scenario,attempt:Attempt,review:ReviewRecord,input:z.infer<typeof chatInput>){
 if(review.user_id!==access.owner||review.case_id!==input.scenario_id||review.attempt_id!==attempt.id||input.attempt_id!==attempt.id)throw new RunError('Review unavailable or access denied.',404);
 const thread=review.state.conversations[input.stakeholder_id];
 if(thread.id!==input.conversation_id)throw new RunError('This conversation belongs to a different or restarted review. Reload the conversation.',409);
 if(thread.request_ids.includes(input.request_id)||(input.action==='start'&&thread.messages.length)||(input.action==='reflect'&&review.state.reflection))return review;
 if(input.action==='send'&&!input.message)throw new RunError('Write a message before sending.',400);
 if(input.action==='restart'&&input.confirmed!==true)throw new RunError('Confirm before restarting this conversation.',400);
 if(input.action==='send'&&thread.messages.length>=61)throw new RunError('This conversation has reached 30 student turns. Finish the review or explicitly restart it.',429);
 const lease=randomUUID();await claimReview(access,review,lease);
 try{
  await reserveMessage(access);
  const state=structuredClone(review.state);
  if(input.action==='reflect')state.reflection=await stakeholderReflection(scenario,attempt,state);
  else{
   const current=state.conversations[input.stakeholder_id];
   if(input.action==='restart'){current.id=randomUUID();current.messages=[];current.request_ids=[];}
   const reply=await stakeholderReply(scenario,attempt,input.stakeholder_id,current.messages,input.action==='send'?input.message:undefined);
   const now=new Date().toISOString();
   if(input.action==='send')current.messages.push({id:randomUUID(),role:'user',content:input.message!,created_at:now});
   current.messages.push({id:randomUUID(),role:'assistant',content:reply,created_at:now});
   current.request_ids.push(input.request_id);state.reflection=null;
  }
  // Reflection retries are also idempotent while the transcripts are unchanged.
  return await commitReview(access,review,lease,state);
 }finally{await releaseReview(access,review,lease).catch(()=>{});}
}
