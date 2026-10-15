import type {User} from '@supabase/supabase-js';

export function isTcuEmail(email:string){
 return /^[^\s@]+@tcu\.edu$/i.test(email.trim());
}

export function canAccessWorkbench(user:User|null,demoMode:boolean){
 if(!user)return false;
 if(user.is_anonymous)return demoMode;
 return Boolean(user.email_confirmed_at&&user.email&&isTcuEmail(user.email));
}

export function displayLabel(user:User){
 const label=user.user_metadata?.demo_email_label;
 return user.is_anonymous
  ? (typeof label==='string'&&isTcuEmail(label)?label:'Anonymous student')
  : user.email||'Student';
}
