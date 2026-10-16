import 'server-only';
import {createClient} from '@supabase/supabase-js';
import type {Scenario} from './types';
import {caseSchema} from './case-schema';
import type {StakeholderConfig} from './stakeholder-config';
import {RunError} from './openai-errors';

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

export async function updatePrivateCaseStakeholders(id:string,owner:string,scenario:Scenario,config:StakeholderConfig,proposalId?:string){
 const updated=caseSchema.parse({...scenario,stakeholders:config});
 let query=admin().from('private_cases').update({scenario:updated}).eq('id',id).eq('owner_id',owner);
 query=proposalId?query.eq('scenario->stakeholders->>proposal_id',proposalId).eq('scenario->stakeholders->>status','proposed'):query.is('scenario->stakeholders',null);
 const {data,error}=await query.select('id').maybeSingle();
 if(error)throw new RunError('Private stakeholder configuration could not be saved. Check server database permissions and retry.',503);
 if(!data)throw new RunError('Stakeholder setup changed or access was denied. Reload the case.',409);
 return updated;
}
