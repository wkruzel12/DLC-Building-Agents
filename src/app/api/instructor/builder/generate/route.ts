import type {NextRequest} from 'next/server';
import {requireInstructor,failure} from '@/lib/instructor-access';
import {builderSetupSchema} from '@/lib/case-builder';
import {generateCase} from '@/lib/case-builder-ai';
import {limitRate} from '@/lib/rate-limit';
import {RunError} from '@/lib/openai-errors';

export const maxDuration=300;

// Drafts a complete case from the instructor's setup. Nothing is saved until the instructor publishes.
export async function POST(request:NextRequest){
 try{
  const user=await requireInstructor(request);
  let body:unknown;try{body=await request.json();}catch{throw new RunError('Send the case setup as JSON.',400);}
  const parsed=builderSetupSchema.safeParse((body as {setup?:unknown})?.setup);
  if(!parsed.success)throw new RunError('Some setup fields are missing or too long: '+[...new Set(parsed.error.issues.map(issue=>issue.path.join('.')))].slice(0,5).join(', '),400);
  limitRate('generate:'+user.id,8,60*60*1000);
  return Response.json({case:await generateCase(parsed.data)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
