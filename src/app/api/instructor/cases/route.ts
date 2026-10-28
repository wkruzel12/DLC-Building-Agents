import type {NextRequest} from 'next/server';
import {requireInstructor,failure} from '@/lib/instructor-access';
import {listPublishedCases} from '@/lib/classroom-store';

export async function GET(request:NextRequest){
 try{
  const user=await requireInstructor(request);
  return Response.json(await listPublishedCases(user.id),{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
