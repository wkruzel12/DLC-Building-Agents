import type {NextRequest} from 'next/server';
import {randomBytes} from 'node:crypto';
import {requireInstructor,failure} from '@/lib/instructor-access';
import {listPublishedCases,savePublishedCase} from '@/lib/classroom-store';
import {builderSetupSchema,editableCaseSchema,caseChecks,toScenario,slugify} from '@/lib/case-builder';
import {caseSchema,MAX_CASE_BYTES} from '@/lib/case-schema';
import {hiringStakeholders} from '@/lib/stakeholder-defaults';
import {publicScenario} from '@/lib/scenario';
import {RunError} from '@/lib/openai-errors';

export async function GET(request:NextRequest){
 try{
  const user=await requireInstructor(request);
  return Response.json(await listPublishedCases(user.id),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}

// Publishes a case built in the case builder. Same storage and join codes as uploaded cases.
export async function POST(request:NextRequest){
 try{
  const user=await requireInstructor(request);
  const raw=await request.text();
  if(raw.length>MAX_CASE_BYTES*2)throw new RunError('This case is too large to publish. Shorten some records.',413);
  let body:{edit?:unknown;setup?:unknown;reviewed?:unknown};try{body=JSON.parse(raw);}catch{throw new RunError('Send the case as JSON.',400);}
  if(body.reviewed!==true)throw new RunError('Confirm you reviewed every expected decision before publishing.',400);
  const edit=editableCaseSchema.safeParse(body.edit),setup=builderSetupSchema.safeParse(body.setup);
  if(!edit.success||!setup.success)throw new RunError('The case or its setup is incomplete. Reload the builder and try again.',400);
  const blocking=caseChecks(edit.data,setup.data).filter(check=>check.level==='error');
  if(blocking.length)throw new RunError('Fix these before publishing: '+blocking.slice(0,3).map(check=>check.message).join(' '),400);
  const id=slugify(edit.data.title)+'-'+randomBytes(3).toString('hex');
  const scenario=caseSchema.parse(toScenario(edit.data,setup.data,id));
  scenario.stakeholders=scenario.stakeholders||hiringStakeholders(scenario)||undefined;
  if(JSON.stringify(scenario).length>MAX_CASE_BYTES)throw new RunError('This case is larger than 1 MB. Shorten some records.',413);
  const saved=await savePublishedCase(user.id,scenario);
  return Response.json({case_id:saved.id,join_code:saved.joinCode,scenario:publicScenario(scenario)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
