import type {NextRequest} from 'next/server';
import {requireInstructor,failure} from '@/lib/instructor-access';
import {guideInput,guideReply,caseContext} from '@/lib/guide';
import {classAttempts} from '@/lib/classroom-store';
import {classSummary} from '@/lib/class-analytics';
import {learningTarget} from '@/lib/learning-config';
import {limitRate} from '@/lib/rate-limit';
import {RunError} from '@/lib/openai-errors';

export const maxDuration=60;

// Proofwork Guide: answers instructor questions using product knowledge plus, when provided,
// the instructor's own case and class totals, or the draft they are building.
export async function POST(request:NextRequest){
 try{
  const user=await requireInstructor(request);
  let body:unknown;try{body=await request.json();}catch{throw new RunError('Send your question as JSON.',400);}
  const parsed=guideInput.safeParse(body);
  if(!parsed.success)throw new RunError('Questions can be up to 4,000 characters, with up to 16 messages in a conversation.',400);
  limitRate('guide:'+user.id,40,60*60*1000);
  let context='';
  if(parsed.data.case_id){
   const data=await classAttempts(parsed.data.case_id,user.id);
   if(data)context=caseContext(data.scenario,classSummary(data.scenario,data.rows,learningTarget(),data.enrolled),data.enrolled);
  }
  if(parsed.data.draft)context+=(context?'\n\n':'')+'CASE DRAFT IN PROGRESS (not yet published):\n'+parsed.data.draft;
  return Response.json({reply:await guideReply(parsed.data,context)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
