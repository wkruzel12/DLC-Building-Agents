'use client';
import {useEffect,useState} from 'react';

export type Role={instructor:boolean;classroom:boolean;loaded:boolean};

// Asks the server which side of the app to show. Failures fall back to the existing student view.
export function useRole(userId?:string|null):Role{
 const [role,setRole]=useState<Role>({instructor:false,classroom:false,loaded:false});
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/instructor/me',{cache:'no-store',signal:controller.signal})
   .then(response=>response.ok?response.json():{instructor:false,classroom:false})
   .then(value=>{if(!controller.signal.aborted)setRole({instructor:value.instructor===true,classroom:value.classroom===true,loaded:true});})
   .catch(()=>{if(!controller.signal.aborted)setRole({instructor:false,classroom:false,loaded:true});});
  return()=>controller.abort();
 },[userId]);
 return role;
}
