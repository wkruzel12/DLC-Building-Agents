import 'server-only';
import {mkdir,readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {atomicReplace} from './atomic-file';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import type {Attempt} from './types';
import type {AttemptLearning} from './results-learning';
import type {ReviewRecord} from './stakeholder-types';
import {RunError} from './openai-errors';

export const REVIEW_TTL=4*60*60*1000;
type Workspace={learning?:Record<string,AttemptLearning>;expiresAt:number;attempts:Attempt[];reviews:ReviewRecord[];reservations:number[]};
const directory=join(tmpdir(),'agent-lab-reviews-'+createHash('sha256').update(process.cwd()).digest('hex').slice(0,12));
const queues=new Map<string,Promise<unknown>>();
const hash=(owner:string)=>createHash('sha256').update(owner).digest('hex');
export async function localWorkspace<T>(owner:string,change:(value:Workspace)=>T):Promise<T>{
 if(process.env.NODE_ENV!=='development'||!owner)throw new RunError('Local review storage is unavailable.',403);
 const key=hash(owner),previous=queues.get(key)||Promise.resolve();
 const operation=previous.catch(()=>{}).then(async()=>{
  await mkdir(directory,{recursive:true,mode:0o700});
  const filename=join(directory,key+'.json');
  let workspace:Workspace={expiresAt:Date.now()+REVIEW_TTL,attempts:[],reviews:[],reservations:[]};
  try{const saved:Workspace=JSON.parse(await readFile(filename,'utf8'));if(saved.expiresAt>Date.now())workspace=saved;}catch{/* A new or expired browser workspace starts empty. */}
  const value=change(workspace);
  if(workspace.attempts.length>20){workspace.attempts=workspace.attempts.slice(-20);const ids=new Set(workspace.attempts.map(item=>item.id));workspace.reviews=workspace.reviews.filter(item=>ids.has(item.attempt_id));if(workspace.learning)workspace.learning=Object.fromEntries(Object.entries(workspace.learning).filter(([id])=>ids.has(id)));}
  const files=await readdir(directory);
  let liveFiles=0;
  for(const file of files){if(!file.endsWith('.json'))continue;try{const saved=JSON.parse(await readFile(join(directory,file),'utf8'));if(saved.expiresAt<=Date.now())await unlink(join(directory,file));else liveFiles++;}catch{/* Ignore a concurrently replaced temporary file. */}}
  if(liveFiles>=100&&!files.includes(key+'.json'))throw new RunError('Local review storage is full. Expired workspaces are cleaned after four hours.',503);
  const temporary=filename+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify(workspace),{mode:0o600});
  try{await atomicReplace(temporary,filename);}catch(error){await unlink(temporary).catch(()=>{});throw error;}
  return value;
 });
 queues.set(key,operation);
 try{return await operation;}finally{if(queues.get(key)===operation)queues.delete(key);}
}
export function saveLocalAttempt(owner:string,attempt:Attempt){return localWorkspace(owner,workspace=>{const next={...attempt,attempt_number:Math.max(0,...workspace.attempts.filter(item=>item.case_id===attempt.case_id).map(item=>item.attempt_number))+1};workspace.attempts.push(next);return next;});}
export function readLocalAttempt(owner:string,caseId:string,attemptId?:string){return localWorkspace(owner,workspace=>workspace.attempts.filter(item=>item.case_id===caseId&&(!attemptId||item.id===attemptId)).at(-1)||null);}
export function reserveLocalMessage(owner:string){return localWorkspace(owner,workspace=>{const now=Date.now();workspace.reservations=workspace.reservations.filter(time=>time>now-3600000);if(workspace.reservations.length>=120||workspace.reservations.filter(time=>time>now-60000).length>=12)throw new RunError('Message limit reached: up to 12 requests per minute and 120 per hour. Please wait and retry.',429);workspace.reservations.push(now);});}
