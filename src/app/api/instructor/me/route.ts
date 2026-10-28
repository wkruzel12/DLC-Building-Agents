import type {NextRequest} from 'next/server';
import {localRequest} from '@/lib/case-access';
import {authorized} from '@/lib/supabase';
import {classroomMode,isInstructor} from '@/lib/roles';

// Tells the UI which side to show. Local development always reports classroom mode off,
// so the existing local upload flow is unchanged.
export async function GET(request:NextRequest){
 const headers={'Cache-Control':'no-store'};
 if(localRequest(request))return Response.json({instructor:false,classroom:false},{headers});
 const {user}=await authorized();
 return Response.json({instructor:isInstructor(user),classroom:classroomMode()},{headers});
}
