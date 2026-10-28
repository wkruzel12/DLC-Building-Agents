import type {User} from '@supabase/supabase-js';

// Instructors are listed in the INSTRUCTOR_EMAILS server setting (comma or space separated).
// When the setting is empty, classroom mode is off and the app behaves exactly as before:
// every signed-in student can upload their own private case.
export function instructorEmails(raw=process.env.INSTRUCTOR_EMAILS){
 return new Set((raw||'').split(/[,\s]+/).map(email=>email.trim().toLowerCase()).filter(Boolean));
}

export function classroomMode(raw=process.env.INSTRUCTOR_EMAILS){
 return instructorEmails(raw).size>0;
}

// Only verified, non-anonymous accounts can be instructors. A demo display label is never trusted.
export function isInstructor(user:User|null,raw=process.env.INSTRUCTOR_EMAILS){
 if(!user||user.is_anonymous||!user.email||!user.email_confirmed_at)return false;
 return instructorEmails(raw).has(user.email.trim().toLowerCase());
}

// Join codes avoid look-alike characters (0/O, 1/I/L) so they are easy to read aloud or project.
export const JOIN_CODE_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH=8;
export function normalizeJoinCode(value:string){
 const code=value.toUpperCase().replace(/[\s-]/g,'');
 return code.length===JOIN_CODE_LENGTH&&[...code].every(letter=>JOIN_CODE_ALPHABET.includes(letter))?code:null;
}
export function formatJoinCode(code:string){return code.slice(0,4)+'-'+code.slice(4);}
