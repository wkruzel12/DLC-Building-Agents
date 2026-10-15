import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {caseSchema,MAX_CASE_BYTES} from '@/lib/case-schema';
import {saveCase,CASE_TTL_MS} from '@/lib/case-store';
import {CASE_COOKIE,localRequest} from '@/lib/case-access';
import {publicScenario} from '@/lib/scenario';
import {authorized} from '@/lib/supabase';
import {savePrivateCase} from '@/lib/private-cases';
import {caseFromPdf} from '@/lib/pdf-case';
import {RunError,openaiFailure} from '@/lib/openai-errors';

export const maxDuration=90;
let pdfImportRunning=false;

export async function POST(request:NextRequest){
 const local=localRequest(request);
 const user=local?null:(await authorized()).user;
 if(!local&&!user)return Response.json({error:'Sign in before uploading a case.'},{status:401});
 if(!local){const origin=request.headers.get('origin');if(origin&&origin!==`${new URL(request.url).protocol}//${request.headers.get('host')}`)return Response.json({error:'Invalid request origin.'},{status:403});}
 const contentType=request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
 const pdf=contentType==='application/pdf';
 if(!pdf&&contentType!=='application/json')return Response.json({error:'Upload a PDF or structured JSON case file.'},{status:415});
 const reader=request.body?.getReader();
 if(!reader)return Response.json({error:'Choose a PDF or JSON case file.'},{status:400});
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_CASE_BYTES){await reader.cancel();return Response.json({error:'Case files must be 1 MB or smaller.'},{status:413});}chunks.push(value);}
 let input:unknown;
 if(pdf){
  if(pdfImportRunning)return Response.json({error:'Another PDF is being imported. Wait a moment and retry.'},{status:429});
  pdfImportRunning=true;
  try{input=await caseFromPdf(Buffer.concat(chunks));}catch(error){const failure=error instanceof RunError?error:openaiFailure(error);return Response.json({error:failure.message},{status:failure.status});}finally{pdfImportRunning=false;}
 }else{try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return Response.json({error:'This file is not valid JSON.'},{status:400});}}
 const parsed=caseSchema.safeParse(input);
 if(!parsed.success)return Response.json({error:'The case does not match the required format.',issues:parsed.error.issues.slice(0,6).map(issue=>`${issue.path.join('.')}: ${issue.message}`)},{status:400});
 try{
  const owner=request.cookies.get(CASE_COOKIE)?.value||randomUUID();
  const stored=local?await saveCase(owner,parsed.data):{id:await savePrivateCase(user!.id,parsed.data),expiresAt:undefined};
  const response=NextResponse.json({case_id:stored.id,scenario:publicScenario(parsed.data),expires_at:stored.expiresAt?new Date(stored.expiresAt).toISOString():undefined},{headers:{'Cache-Control':'no-store'}});
  if(local)response.cookies.set(CASE_COOKIE,owner,{httpOnly:true,sameSite:'strict',path:'/',maxAge:CASE_TTL_MS/1000});
  return response;
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Case storage is unavailable.'},{status:503});}
}
