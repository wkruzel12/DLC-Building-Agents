import {NextRequest} from 'next/server';
import {z} from 'zod';
import {authorized} from '@/lib/supabase';
import {CASE_COOKIE,localRequest,resolveCase} from '@/lib/case-access';
import {chatInput} from '@/lib/stakeholder-types';
import {getReview,trustedAttempt,type ReviewAccess} from '@/lib/stakeholder-store';
import {stakeholderSet} from '@/lib/stakeholder-context';
import {performReviewAction,publicReview} from '@/lib/stakeholder-service';
import {RunError,openaiFailure} from '@/lib/openai-errors';

export const maxDuration=50;
const querySchema=z.object({scenario_id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),attempt_id:z.string().uuid().optional()});
async function accessFor(request:NextRequest):Promise<ReviewAccess>{
 if(localRequest(request)){const owner=request.cookies.get(CASE_COOKIE)?.value;if(!owner)throw new RunError('No trusted local attempt is available. Run the agent once in this browser before stakeholder review.',409);return {local:true,owner};}
 const {user}=await authorized();if(!user)throw new RunError('Sign in before accessing stakeholder conversations.',401);
 const origin=request.headers.get('origin');if(origin&&origin!==`${new URL(request.url).protocol}//${request.headers.get('host')}`)throw new RunError('Invalid request origin.',403);
 return {local:false,owner:user.id};
}
async function contextFor(request:NextRequest,access:ReviewAccess,caseId:string,attemptId?:string){
 const scenario=await resolveCase(request,caseId,access.local?undefined:access.owner);
 if(!scenario)throw new RunError('The selected case is unavailable or expired. Reload or upload the case again.',404);
 stakeholderSet(scenario);
 const attempt=await trustedAttempt(access,caseId,attemptId);
 if(!attempt)throw new RunError('This completed attempt is unavailable or does not belong to this case and browser/account. Older browser-only attempts need a new run to create trusted review context.',404);
 const review=await getReview(access,caseId,attempt.id);
 return {scenario,attempt,review};
}
function failure(error:unknown){const safe=error instanceof RunError?error:openaiFailure(error);return Response.json({error:safe.message},{status:safe.status,headers:{'Cache-Control':'no-store'}});}
export async function GET(request:NextRequest){
 try{
  const access=await accessFor(request),input=querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if(!input.success)throw new RunError('Select a valid case and completed attempt.',400);
  const {scenario,attempt,review}=await contextFor(request,access,input.data.scenario_id,input.data.attempt_id);
  return Response.json(publicReview(review,scenario,attempt,access.local),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
export async function POST(request:NextRequest){
 try{
  const access=await accessFor(request),reader=request.body?.getReader();if(!reader)throw new RunError('Missing conversation request.',400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();throw new RunError('Conversation request is too large.',413);}chunks.push(value);}
  let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RunError('Invalid conversation request.',400);}
  const input=chatInput.safeParse(body);if(!input.success)throw new RunError('Use a valid stakeholder, case, attempt, conversation, and message of at most 2,000 characters. Restart requests need confirmation.',400);
  const {scenario,attempt,review}=await contextFor(request,access,input.data.scenario_id,input.data.attempt_id);
  const saved=await performReviewAction(access,scenario,attempt,review,input.data);
  return Response.json(publicReview(saved,scenario,attempt,access.local),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
