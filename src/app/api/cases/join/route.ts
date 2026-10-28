import type {NextRequest} from 'next/server';
import {localRequest} from '@/lib/case-access';
import {authorized} from '@/lib/supabase';
import {sameOrigin,failure} from '@/lib/instructor-access';
import {normalizeJoinCode} from '@/lib/roles';
import {joinCase} from '@/lib/classroom-store';
import {publicScenario} from '@/lib/scenario';
import {RunError} from '@/lib/openai-errors';

// Student enters the instructor's join code. Returns the same shape as /api/cases/[id]
// (no answer key), so the existing student flow picks it up unchanged.
export async function POST(request:NextRequest){
 try{
  if(localRequest(request))throw new RunError('Join codes work in the signed-in deployment. Locally, upload the case file instead.',409);
  if(!sameOrigin(request))throw new RunError('Invalid request origin.',403);
  const {user}=await authorized();
  if(!user)throw new RunError('Sign in before joining a case.',401);
  let body:unknown;try{body=await request.json();}catch{throw new RunError('Enter the join code from your instructor.',400);}
  const raw=typeof body==='object'&&body&&'code' in body&&typeof body.code==='string'?body.code:'';
  const code=normalizeJoinCode(raw);
  if(!code)throw new RunError('Join codes are 8 letters and numbers, like ABCD-2345.',400);
  const joined=await joinCase(code,user.id);
  if(!joined)throw new RunError('No case matches that code. Check it with your instructor.',404);
  return Response.json({case_id:joined.id,scenario:publicScenario(joined.scenario)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
