import type {NextRequest} from 'next/server';
import {requireInstructor,failure} from '@/lib/instructor-access';
import {analyzeMaterials,MAX_MATERIAL_BYTES,MAX_MATERIAL_TEXT,type Material} from '@/lib/case-builder-ai';
import {limitRate} from '@/lib/rate-limit';
import {RunError} from '@/lib/openai-errors';

export const maxDuration=120;

// Reads an uploaded syllabus/assignment (PDF or text) and suggests outcomes, skills, and a summary.
export async function POST(request:NextRequest){
 try{
  const user=await requireInstructor(request);
  const declared=Number(request.headers.get('content-length')||0);
  if(declared>MAX_MATERIAL_BYTES+64*1024)throw new RunError('Materials must total 4 MB or less. Upload fewer files or paste the key sections.',413);
  let form:FormData;try{form=await request.formData();}catch{throw new RunError('Upload the materials as a form.',400);}
  const materials:Material[]=[];let total=0;
  for(const entry of form.getAll('files')){
   if(!(entry instanceof File)||entry.size===0)continue;
   total+=entry.size;
   if(total>MAX_MATERIAL_BYTES)throw new RunError('Materials must total 4 MB or less. Upload fewer files or paste the key sections.',413);
   if(materials.length>=4)throw new RunError('Upload up to four files at a time.',400);
   const name=entry.name.slice(0,200),lower=name.toLowerCase(),bytes=Buffer.from(await entry.arrayBuffer());
   if(lower.endsWith('.pdf')){
    if(bytes.subarray(0,5).toString('ascii')!=='%PDF-')throw new RunError(`"${name}" is not a readable PDF.`,400);
    materials.push({name,kind:'pdf',data:bytes});
   }else if(/\.(txt|md|markdown|csv)$/.test(lower))materials.push({name,kind:'text',data:bytes.toString('utf8').slice(0,MAX_MATERIAL_TEXT)});
   else throw new RunError(`"${name}" isn't supported. Use PDF or plain text; save Word files as PDF first.`,415);
  }
  const pasted=String(form.get('pasted')||'').slice(0,MAX_MATERIAL_TEXT);
  limitRate('analyze:'+user.id,10,60*60*1000);
  const analysis=await analyzeMaterials(materials,pasted);
  return Response.json({...analysis,files:materials.map(m=>({name:m.name,chars:typeof m.data==='string'?m.data.length:m.data.length}))},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
