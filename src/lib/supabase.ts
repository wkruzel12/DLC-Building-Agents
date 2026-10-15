import 'server-only';
import {createServerClient} from '@supabase/ssr';
import type {SetAllCookies} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {canAccessWorkbench} from './auth-access';
const url=()=>process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key=()=>process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export async function serverSupabase(){const jar=await cookies();const setAll:SetAllCookies=(items)=>{try{items.forEach(({name,value,options})=>jar.set(name,value,options))}catch{/* server component: cookie writes handled in callback */}};return createServerClient(url(),key(),{cookies:{getAll(){return jar.getAll()},setAll}});}
export async function authorized(){const db=await serverSupabase();const {data:{user},error}=await db.auth.getUser();if(error||!canAccessWorkbench(user,process.env.DEMO_MODE==='true'))return {db,user:null};return {db,user};}
