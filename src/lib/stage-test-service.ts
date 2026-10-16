import 'server-only';
import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {runStage} from './runner';
import {RunError} from './openai-errors';
import {publicScenario} from './scenario';
import {reserveMessage,type ReviewAccess} from './stakeholder-store';
import {stageOrder,type StageTest} from './builder-progress';
import type {Scenario} from './types';

const steps=z.object({extract:z.string().trim().max(1500),check:z.string().trim().max(1500),flag:z.string().trim().max(1500)}).strict();
export const stageTestInput=z.object({case_id:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),record_id:z.string().min(1).max(100),stage:z.enum(stageOrder),steps,upstream:z.object({extract:z.string().max(24000).optional(),check:z.string().max(24000).optional()}).strict().default({}),request_id:z.string().uuid()}).strict().refine(value=>stageOrder.slice(0,stageOrder.indexOf(value.stage)+1).every(stage=>value.steps[stage].length>=10),'Current and preceding instructions need at least 10 characters.');
type Input=z.infer<typeof stageTestInput>;
type Receipt=StageTest&{owner_tag:string;case_id:string;case_hash:string};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
function signingKey(){const secret=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.OPENAI_API_KEY;if(!secret)throw new RunError('Stage testing requires a server-side OpenAI API key.',503);return createHmac('sha256',secret).update('agent-lab:stage-tests:v1').digest();}
function signature(data:string){return createHmac('sha256',signingKey()).update(data).digest('base64url');}
function encode(value:Omit<Receipt,'receipt'>){const data=Buffer.from(JSON.stringify(value)).toString('base64url');return data+'.'+signature(data);}
function decode(token:string):Receipt{
 const [data,mac,...extra]=token.split('.');
 if(!data||!mac||extra.length)throw new RunError('The previous test could not be verified. Retest that stage.',409);
 const expected=Buffer.from(signature(data)),provided=Buffer.from(mac);
 if(expected.length!==provided.length||!timingSafeEqual(expected,provided))throw new RunError('The previous test could not be verified. Retest that stage.',409);
 try{return {...JSON.parse(Buffer.from(data,'base64url').toString('utf8')),receipt:token};}catch{throw new RunError('The previous test is invalid. Retest that stage.',409);}
}
const cache=new Map<string,{fingerprint:string;expires:number;promise:Promise<StageTest>}>(),owners=new Set<string>();
let running=0;
export async function performStageTest(access:ReviewAccess,scenario:Scenario,input:Input):Promise<StageTest>{
 const publicCase=publicScenario(scenario),caseHash=hash(JSON.stringify(publicCase)),ownerTag=hash((access.local?'local:':'user:')+access.owner);
 if(!publicCase.items.some(item=>item.id===input.record_id))throw new RunError('Choose an existing case record; record IDs are case-sensitive.',400);
 const index=stageOrder.indexOf(input.stage),previous:Receipt[]=[];
 for(const name of stageOrder.slice(0,index)){
  const token=input.upstream[name as 'extract'|'check'];if(!token)throw new RunError('Test the preceding stages successfully before continuing.',409);
  const test=decode(token);
  if(test.stage!==name||test.owner_tag!==ownerTag||test.case_id!==input.case_id||test.case_hash!==caseHash||test.record_id!==input.record_id||Date.parse(test.expires_at)<=Date.now()||stageOrder.slice(0,stageOrder.indexOf(name)+1).some(stage=>test.steps[stage]!==input.steps[stage])||previous.some((value,i)=>test.upstream_ids[i]!==value.id))throw new RunError('Earlier tests are outdated or belong to a different case, record, or student. Retest in order.',409);
  previous.push(test);
 }
 const key=ownerTag+':'+input.request_id,fingerprint=hash(JSON.stringify(input));
 for(const [key,value]of cache)if(value.expires<=Date.now())cache.delete(key);
 const saved=cache.get(key);if(saved){if(saved.fingerprint!==fingerprint)throw new RunError('This test request changed. Start a new test.',409);return saved.promise;}
 if(owners.has(ownerTag)||running>=2)throw new RunError('Another stage test is running. Wait a moment and retry.',429);
 if(cache.size>=200)throw new RunError('Stage testing is busy. Please retry shortly.',429);
 owners.add(ownerTag);running++;
 const promise=(async()=>{
  try{
   // Reuse the durable 12/minute, 120/hour AI-message budget, not full-run attempts.
   try{await reserveMessage(access);}catch(error){if(error instanceof RunError&&error.status===503)throw new RunError('Stage-test rate-limit storage is unavailable. Apply supabase/stakeholders.sql and check the server configuration.',503);throw error;}
   const output=await runStage(publicCase,input.record_id,input.steps,input.stage,Object.fromEntries(previous.map(test=>[test.stage,test.output])));
   const value={...output,id:randomUUID(),stage:input.stage,record_id:input.record_id,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+4*3600000).toISOString(),steps:input.steps,upstream_ids:previous.map(test=>test.id)};
   const receipt=encode({...value,owner_tag:ownerTag,case_id:input.case_id,case_hash:caseHash});
   return {...value,receipt};
  }finally{owners.delete(ownerTag);running--;}
 })();
 cache.set(key,{fingerprint,expires:Date.now()+5*60000,promise});
 try{return await promise;}catch(error){cache.delete(key);throw error;}
}
