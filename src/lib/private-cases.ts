import 'server-only';
import {createClient} from '@supabase/supabase-js';
import type {Scenario} from './types';
import {caseSchema} from './case-schema';

function admin(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});}
export async function savePrivateCase(owner:string,scenario:Scenario){
 const {data,error}=await admin().from('private_cases').insert({owner_id:owner,scenario}).select('id').single();
 if(error)throw Error('Private case storage is unavailable. Apply supabase/cases.sql and check the server database configuration.');
 return data.id as string;
}
export async function readPrivateCase(id:string,owner:string):Promise<Scenario|null>{
 const {data,error}=await admin().from('private_cases').select('scenario').eq('id',id).eq('owner_id',owner).maybeSingle();
 if(error)throw Error('Private case storage is unavailable. Please retry later.');
 return data?caseSchema.parse(data.scenario):null;
}
