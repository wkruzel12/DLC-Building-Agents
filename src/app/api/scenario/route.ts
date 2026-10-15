import {authorized} from '@/lib/supabase';import {loadScenario,publicScenario} from '@/lib/scenario';
export async function GET(){const {user}=await authorized();if(!user)return Response.json({error:'Unauthorized'},{status:401});const s=loadScenario('resume-screener')!;return Response.json(publicScenario(s),{headers:{'Cache-Control':'no-store'}});}
