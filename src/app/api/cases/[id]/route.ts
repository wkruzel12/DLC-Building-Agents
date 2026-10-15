import type {NextRequest} from 'next/server';
import {localRequest,resolveCase} from '@/lib/case-access';
import {authorized} from '@/lib/supabase';
import {publicScenario} from '@/lib/scenario';

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const local=localRequest(request),user=local?null:(await authorized()).user;
 if(!local&&!user)return Response.json({error:'Sign in to access this case.'},{status:401});
 try{
  const {id}=await params,scenario=await resolveCase(request,id,user?.id);
  if(!scenario)return Response.json({error:'Case unavailable or expired. Upload it again or try the sample case.'},{status:404});
  return Response.json({case_id:id,scenario:publicScenario(scenario)},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Case storage is unavailable. Please retry later.'},{status:503});}
}
