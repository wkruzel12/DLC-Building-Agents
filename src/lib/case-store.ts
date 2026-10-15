import 'server-only';
import {mkdir,readdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import type {Scenario} from './types';
import {caseSchema} from './case-schema';

export const CASE_TTL_MS=4*60*60*1000;
const directory=join(tmpdir(),'agent-lab-cases-'+createHash('sha256').update(process.cwd()).digest('hex').slice(0,12));
const validId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
type StoredCase={owner:string;expiresAt:number;scenario:Scenario};
let queue:Promise<unknown>=Promise.resolve();
function developmentOnly(){if(process.env.NODE_ENV!=='development')throw Error('Temporary case storage is available only in development.');}

export async function saveCase(owner:string,scenario:Scenario){
 developmentOnly();
 const operation=queue.catch(()=>{}).then(async()=>{
  await mkdir(directory,{recursive:true,mode:0o700});
  let count=0,owned=0;
  for(const file of await readdir(directory)){
   if(!file.endsWith('.json'))continue;
   const path=join(directory,file);
   try{const value:StoredCase=JSON.parse(await readFile(path,'utf8'));if(value.expiresAt<=Date.now()){await unlink(path);continue;}count++;if(value.owner===owner)owned++;}catch{await unlink(path).catch(()=>{});}
  }
  if(count>=100||owned>=10)throw Error('Temporary case limit reached. Existing uploads expire after four hours.');
  const id=randomUUID(),expiresAt=Date.now()+CASE_TTL_MS;
  await writeFile(join(directory,id+'.json'),JSON.stringify({owner,expiresAt,scenario}),{mode:0o600,flag:'wx'});
  return {id,expiresAt};
 });
 queue=operation;
 return operation;
}

export async function readCase(id:string,owner:string):Promise<Scenario|null>{
 developmentOnly();
 if(!validId(id)||!owner)return null;
 const path=join(directory,id+'.json');
 try{
  const value:StoredCase=JSON.parse(await readFile(path,'utf8'));
  if(value.expiresAt<=Date.now()){await unlink(path).catch(()=>{});return null;}
  if(value.owner!==owner)return null;
  return caseSchema.parse(value.scenario);
 }catch{return null;}
}
