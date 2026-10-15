import {authorized} from '@/lib/supabase';import {loadScenario} from '@/lib/scenario';import {runAll,score} from '@/lib/runner';import {createClient} from '@supabase/supabase-js';
import {runInput as schema} from '@/lib/run-input';
import {openaiFailure} from '@/lib/openai-errors';
import type {NextRequest} from 'next/server';
import {resolveCase} from '@/lib/case-access';
export const maxDuration=120;
export async function POST(request:NextRequest){
 const {db,user}=await authorized();if(!user)return Response.json({error:'Please enter the workbench with an authorized session.'},{status:401});
 let input;try{input=schema.parse(await request.json())}catch{return Response.json({error:'Instructions must be between 10 and 1500 characters each.'},{status:400})}
 let s;
 try{s=await resolveCase(request,input.case_id,user.id);}catch{return Response.json({error:'Private case storage is unavailable.'},{status:503});}
 if(!s)return Response.json({error:'Case unavailable or access denied.'},{status:404});
 // PostgreSQL atomically limits runs to 15 per rolling hour and reserves an attempt number.
 const {data:attemptNumber,error:limitError}=await db.rpc('reserve_run',{p_scenario_id:input.case_id});
 if(limitError)return Response.json({error:limitError.message},{status:limitError.message.includes('RUN_LIMIT')?429:500});
 try{
  const results=await runAll(s,input.steps);const metrics=score(s,results);
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.from('attempts').insert({user_id:user.id,scenario_id:input.case_id,attempt_number:attemptNumber,steps:input.steps,results,...metrics,mode:process.env.DEMO_MODE==='true'?'demo':'openai'}).select('id,attempt_number,created_at,steps,results,planted_caught,planted_total,accuracy,errors,mode').single();
  if(error)throw error;
  return Response.json({...data,case_id:input.case_id,scenario_title:s.title,records:s.items},{headers:{'Cache-Control':'no-store'}});
 }catch(e){const failure=openaiFailure(e);return Response.json({error:failure.message},{status:failure.status})}
}
