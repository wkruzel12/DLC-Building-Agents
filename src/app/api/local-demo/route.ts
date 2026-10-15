import {localDemoEnabled} from '@/lib/local-demo';
import {loadScenario,publicScenario} from '@/lib/scenario';
import {NextResponse,type NextRequest} from 'next/server';
import {CASE_COOKIE,localRequest,resolveCase} from '@/lib/case-access';
import {saveLocalAttempt,REVIEW_TTL} from '@/lib/stakeholder-local';
import type {Attempt} from '@/lib/types';
import {runInput} from '@/lib/run-input';
import {runAll,score} from '@/lib/runner';
import {openaiFailure} from '@/lib/openai-errors';

export const maxDuration=120;
let running=false;

const allowed=localRequest;

export async function GET(request:Request){
 if(!allowed(request))return new Response(null,{status:404});
 return Response.json(publicScenario(loadScenario('resume-screener')!),{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request:NextRequest){
 if(!allowed(request))return new Response(null,{status:404});
 let input;
 try{input=runInput.parse(await request.json());}catch{return Response.json({error:'Instructions must be between 10 and 1500 characters each.'},{status:400});}
 if(running)return Response.json({error:'A local run is already in progress. Wait for it to finish before retrying.'},{status:429});
 running=true;
 try{
 const scenario=await resolveCase(request,input.case_id);
 if(!scenario)return Response.json({error:'Case unavailable or expired. Upload it again.'},{status:404});
 const results=await runAll(scenario,input.steps);
 const owner=request.cookies.get(CASE_COOKIE)?.value||crypto.randomUUID();
 const attempt:Attempt={id:crypto.randomUUID(),case_id:input.case_id,attempt_number:0,created_at:new Date().toISOString(),steps:input.steps,results,...score(scenario,results),mode:process.env.DEMO_MODE==='true'?'demo':'openai',storage:'local',scenario_title:scenario.title,records:publicScenario(scenario).items};
 const saved=await saveLocalAttempt(owner,attempt);
 const response=NextResponse.json(saved,{headers:{'Cache-Control':'no-store'}});
 response.cookies.set(CASE_COOKIE,owner,{httpOnly:true,sameSite:'strict',path:'/',maxAge:REVIEW_TTL/1000});
 return response;
 }catch(error){const failure=openaiFailure(error);return Response.json({error:failure.message},{status:failure.status});}finally{running=false;}
}
