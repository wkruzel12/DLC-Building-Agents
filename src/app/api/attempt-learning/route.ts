import {NextRequest} from 'next/server';
import {z} from 'zod';
import {authorized} from '@/lib/supabase';
import {localRequest,CASE_COOKIE,resolveCase} from '@/lib/case-access';
import {trustedAttempt,reserveMessage} from '@/lib/stakeholder-store';
import {completedCount,readLearning,writeLearning} from '@/lib/attempt-learning-store';
import {validReflection} from '@/lib/results-learning';
import {learningTarget} from '@/lib/learning-config';
import {coachAttempt} from '@/lib/results-coaching';
import {RunError,openaiFailure} from '@/lib/openai-errors';

export const maxDuration=45;
const base={case_id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),attempt_id:z.string().uuid()};
const schema=z.discriminatedUnion('action',[z.object({...base,action:z.literal('save'),reflection:z.string().trim().max(1500),acknowledged_below_target:z.boolean().default(false)}).strict(),z.object({...base,action:z.literal('coach')}).strict()]);
const running=new Set<string>();
export async function POST(request:NextRequest){
 try{
  const local=localRequest(request),user=local?null:(await authorized()).user;
  if(!local&&!user)throw new RunError('Sign in before saving reflections or requesting AI suggestions.',401);
  const url=new URL(request.url),origin=request.headers.get('origin');if(origin&&origin!==`${url.protocol}//${request.headers.get('host')||url.host}`)throw new RunError('Invalid request origin.',403);
  const owner=local?request.cookies.get(CASE_COOKIE)?.value:user!.id;if(!owner)throw new RunError('Run a simulation in this browser before reviewing it.',409);
  const reader=request.body?.getReader();if(!reader)throw new RunError('Missing learning request.',400);
  const chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12000){await reader.cancel();throw new RunError('Learning request is too large.',413);}chunks.push(value);}
  let raw:unknown;try{raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RunError('Invalid learning request.',400);}
  const parsed=schema.safeParse(raw);if(!parsed.success)throw new RunError('Select a valid attempt and use a reflection of at most 1,500 characters.',400);
  const input=parsed.data,access={local,owner};
  const scenario=await resolveCase(request,input.case_id,local?undefined:owner),attempt=await trustedAttempt(access,input.case_id,input.attempt_id);
  if(!scenario||!attempt)throw new RunError('Attempt unavailable or access denied.',404);
  if(input.action==='save'){
   if(attempt.accuracy<learningTarget()&&!input.acknowledged_below_target&&!validReflection(input.reflection))throw new RunError('Write a brief reflection of 10–1,500 characters before another full simulation.',400);
   if(input.acknowledged_below_target&&await completedCount(access,input.case_id)<3)throw new RunError('Below-target stakeholder acknowledgment becomes available after three completed simulations.',400);
   return Response.json(await writeLearning(access,input.case_id,attempt.id,{reflection:input.reflection,acknowledged_below_target:input.acknowledged_below_target}),{headers:{'Cache-Control':'no-store'}});
  }
  if(await completedCount(access,input.case_id)<3)throw new RunError('AI suggestions unlock after three completed full simulations. Stage tests do not count.',403);
  const previous=await readLearning(access,input.case_id,attempt.id);if(previous.coaching)return Response.json(previous,{headers:{'Cache-Control':'no-store'}});
  const key=owner;if(running.has(key)||running.size>=2)throw new RunError('AI suggestions are already being prepared. Wait and reload this attempt.',409);
  running.add(key);
  try{await reserveMessage(access);const coaching=await coachAttempt(scenario,attempt);return Response.json(await writeLearning(access,input.case_id,attempt.id,{coaching}),{headers:{'Cache-Control':'no-store'}});}finally{running.delete(key);}
 }catch(error){const failure=error instanceof RunError?error:openaiFailure(error);return Response.json({error:failure.message},{status:failure.status,headers:{'Cache-Control':'no-store'}});}
}
