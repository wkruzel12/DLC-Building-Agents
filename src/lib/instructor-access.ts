import 'server-only';
import type {NextRequest} from 'next/server';
import {authorized} from './supabase';
import {localRequest} from './case-access';
import {isInstructor,classroomMode} from './roles';
import {RunError} from './openai-errors';

export function sameOrigin(request:NextRequest){
 const origin=request.headers.get('origin');
 return !origin||origin===`${new URL(request.url).protocol}//${request.headers.get('host')}`;
}

// Local development skips sign-in and keeps attempts in the browser, so there is no class data
// to show there. Classroom features run only in the authenticated (Supabase) environment.
export async function requireInstructor(request:NextRequest){
 if(localRequest(request))throw new RunError('The instructor dashboard runs in the signed-in deployment, where class attempts are saved. Local development keeps attempts in each browser.',409);
 if(!sameOrigin(request))throw new RunError('Invalid request origin.',403);
 const {user}=await authorized();
 if(!user)throw new RunError('Sign in with your verified TCU email first.',401);
 if(!classroomMode()||!isInstructor(user))throw new RunError('This page is for instructors. Ask your administrator to add your email to the instructor list.',403);
 return user;
}

export function failure(error:unknown){
 const safe=error instanceof RunError?error:new RunError(error instanceof Error?error.message:'Something went wrong. Please retry.',503);
 return Response.json({error:safe.message},{status:safe.status,headers:{'Cache-Control':'no-store'}});
}
