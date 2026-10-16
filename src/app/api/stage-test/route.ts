import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {authorized} from '@/lib/supabase';
import {CASE_COOKIE,localRequest,resolveCase} from '@/lib/case-access';
import {stageTestInput,performStageTest} from '@/lib/stage-test-service';
import {RunError,openaiFailure} from '@/lib/openai-errors';
import {REVIEW_TTL} from '@/lib/stakeholder-local';

export const maxDuration=45;
export async function POST(request:NextRequest){
 try{
  const local=localRequest(request);
  const user=local?null:(await authorized()).user;
  if(!local&&!user)throw new RunError('Sign in before testing AI instructions.',401);
  const origin=request.headers.get('origin'),url=new URL(request.url);
  if(origin&&origin!==`${url.protocol}//${request.headers.get('host')||url.host}`)throw new RunError('Invalid request origin.',403);
  const owner=local?request.cookies.get(CASE_COOKIE)?.value||randomUUID():user!.id;
  const reader=request.body?.getReader();if(!reader)throw new RunError('Missing stage-test request.',400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>96000){await reader.cancel();throw new RunError('Stage-test request is too large.',413);}chunks.push(value);}
  let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RunError('Invalid stage-test request.',400);}
  const parsed=stageTestInput.safeParse(body);
  if(!parsed.success)throw new RunError('Select a stage and record. Instructions need 10–1,500 characters for the current and preceding stages.',400);
  const scenario=await resolveCase(request,parsed.data.case_id,local?undefined:owner);
  if(!scenario)throw new RunError('This case is unavailable or access was denied. Reload or upload it again.',404);
  const result=await performStageTest({local,owner},scenario,parsed.data);
  const response=NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  if(local)response.cookies.set(CASE_COOKIE,owner,{httpOnly:true,sameSite:'strict',path:'/',maxAge:REVIEW_TTL/1000});
  return response;
 }catch(error){const failure=error instanceof RunError?error:openaiFailure(error);return Response.json({error:failure.message},{status:failure.status,headers:{'Cache-Control':'no-store'}});}
}
