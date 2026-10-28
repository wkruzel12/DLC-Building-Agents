import 'server-only';
import {randomInt} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import type {Scenario} from './types';
import {caseSchema} from './case-schema';
import {readPrivateCase} from './private-cases';
import {JOIN_CODE_ALPHABET,JOIN_CODE_LENGTH} from './roles';
import type {ClassAttemptRow} from './class-analytics';

// Same server-only service client as private-cases.ts. Every query below filters by the
// signed-in instructor or student explicitly, because the service key bypasses row security.
function admin(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});}
const unavailable='Classroom storage is unavailable. Apply supabase/classroom.sql and check the server database configuration.';

export function generateJoinCode(){return Array.from({length:JOIN_CODE_LENGTH},()=>JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)]).join('');}

// Instructor upload: stored like any private case, plus a join code students can enter.
export async function savePublishedCase(owner:string,scenario:Scenario){
 for(let tries=0;tries<5;tries++){
  const joinCode=generateJoinCode();
  const {data,error}=await admin().from('private_cases').insert({owner_id:owner,scenario,join_code:joinCode}).select('id,join_code').single();
  if(!error)return {id:data.id as string,joinCode:data.join_code as string};
  if(error.code!=='23505')throw Error(unavailable); // 23505 = join code collision, so try another
 }
 throw Error('Could not create a unique join code. Please retry.');
}

export async function listPublishedCases(owner:string){
 const {data,error}=await admin().from('private_cases').select('id,join_code,created_at,scenario').eq('owner_id',owner).not('join_code','is',null).order('created_at',{ascending:false}).limit(100);
 if(error)throw Error(unavailable);
 const ids=(data||[]).map(row=>row.id as string);
 const counts=new Map<string,number>();
 if(ids.length){
  const {data:enrolled,error:enrollError}=await admin().from('case_enrollments').select('case_id').in('case_id',ids);
  if(enrollError)throw Error(unavailable);
  for(const row of enrolled||[])counts.set(row.case_id,(counts.get(row.case_id)||0)+1);
 }
 // Only display fields leave the server; the stored scenario also contains the answer key.
 return (data||[]).map(row=>({case_id:row.id as string,join_code:row.join_code as string,created_at:row.created_at as string,title:String(row.scenario?.title||'Untitled case'),records:Array.isArray(row.scenario?.items)?row.scenario.items.length:0,enrolled:counts.get(row.id)||0}));
}

// Student enters a code: enroll them and return the case so the existing flow can continue.
export async function joinCase(joinCode:string,user:string):Promise<{id:string;scenario:Scenario}|null>{
 const {data,error}=await admin().from('private_cases').select('id,scenario').eq('join_code',joinCode).maybeSingle();
 if(error)throw Error(unavailable);
 if(!data)return null;
 const {error:enrollError}=await admin().from('case_enrollments').upsert({case_id:data.id,user_id:user},{onConflict:'case_id,user_id',ignoreDuplicates:true});
 if(enrollError)throw Error(unavailable);
 return {id:data.id as string,scenario:caseSchema.parse(data.scenario)};
}

// Lets an enrolled student open an instructor's case (owners are handled by readPrivateCase).
export async function readEnrolledCase(id:string,user:string):Promise<Scenario|null>{
 const {data:enrollment,error}=await admin().from('case_enrollments').select('case_id').eq('case_id',id).eq('user_id',user).maybeSingle();
 if(error)throw Error(unavailable);
 if(!enrollment)return null;
 const {data,error:caseError}=await admin().from('private_cases').select('scenario').eq('id',id).not('join_code','is',null).maybeSingle();
 if(caseError)throw Error(unavailable);
 return data?caseSchema.parse(data.scenario):null;
}

// Dashboard data: only for a case the instructor owns. Results are summarized server-side;
// raw stage outputs and student instructions never reach the dashboard response.
export async function classAttempts(caseId:string,owner:string){
 const scenario=await readPrivateCase(caseId,owner);
 if(!scenario)return null;
 const {data,error}=await admin().from('attempts').select('user_id,attempt_number,created_at,accuracy,planted_caught,planted_total,errors,results').eq('scenario_id',caseId).order('created_at',{ascending:false}).limit(5000);
 if(error)throw Error('Could not load class attempts. Please retry later.');
 const {count,error:countError}=await admin().from('case_enrollments').select('user_id',{count:'exact',head:true}).eq('case_id',caseId);
 if(countError)throw Error(unavailable);
 return {scenario,rows:(data||[]) as ClassAttemptRow[],enrolled:count||0};
}
