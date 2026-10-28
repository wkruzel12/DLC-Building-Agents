import type {NextRequest} from 'next/server';
import {requireInstructor,failure} from '@/lib/instructor-access';
import {classAttempts} from '@/lib/classroom-store';
import {classSummary} from '@/lib/class-analytics';
import {learningTarget} from '@/lib/learning-config';
import {RunError} from '@/lib/openai-errors';

export async function GET(request:NextRequest){
 try{
  const user=await requireInstructor(request);
  const caseId=request.nextUrl.searchParams.get('case_id')||'';
  if(!/^[0-9a-f-]{36}$/i.test(caseId))throw new RunError('Choose one of your published cases.',400);
  const data=await classAttempts(caseId,user.id);
  if(!data)throw new RunError('Case unavailable or not yours.',404);
  return Response.json({case_id:caseId,title:data.scenario.title,summary:classSummary(data.scenario,data.rows,learningTarget(),data.enrolled)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
