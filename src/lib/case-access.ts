import 'server-only';
import type {NextRequest} from 'next/server';
import {localDemoEnabled} from './local-demo';
import {loadScenario} from './scenario';
import {readCase} from './case-store';
import {readPrivateCase} from './private-cases';

export const CASE_COOKIE='agent-lab-case-owner';
export function localRequest(request:Request){
 const url=new URL(request.url);
 return localDemoEnabled()&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  &&(!request.headers.get('origin')||request.headers.get('origin')===`${url.protocol}//${request.headers.get('host')||url.host}`);
}
export async function resolveCase(request:NextRequest,id:string,userId?:string){
 if(id==='resume-screener')return loadScenario(id);
 if(localRequest(request))return readCase(id,request.cookies.get(CASE_COOKIE)?.value||'');
 if(!userId||!/^[0-9a-f-]{36}$/i.test(id))return null;
 return readPrivateCase(id,userId);
}
