'use client';
import {useState} from 'react';
import type {CaseReference} from '@/lib/types';
import {Icon} from './ui';

// Shown to students instead of the file upload when an instructor list is configured.
export function JoinCode({onJoined,disabled,beforeJoin}:{onJoined:(value:CaseReference)=>void;disabled?:boolean;beforeJoin:()=>boolean}){
 const [code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function join(event:React.FormEvent){
  event.preventDefault();
  if(busy||!beforeJoin())return;
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/cases/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'Could not join this case.');
   onJoined(body as CaseReference);setCode('');
  }catch(error){setMessage(error instanceof Error?error.message:'Could not join this case. Please retry.');}
  finally{setBusy(false);}
 }
 return <section className="upload-card join-card" aria-labelledby="join-title"><div className="card-heading"><div><h2 id="join-title">Have a code from your instructor?</h2><p>Enter it to open your class case.</p></div></div>
  <form className="join-form" onSubmit={join}><label htmlFor="join-code" className="visually-hidden">Join code</label><input id="join-code" className="input join-input" value={code} onChange={event=>setCode(event.target.value)} placeholder="ABCD-2345" autoComplete="off" spellCheck={false} maxLength={12} required disabled={busy||disabled}/><button className="button primary" disabled={busy||disabled||code.trim().length<8}>{busy?'Joining…':'Join case'}<Icon name="arrow" size={16}/></button></form>
  {message&&<p className="upload-message error-text" role="alert">{message}</p>}
  <p className="upload-privacy"><Icon name="shield" size={16}/> Your instructor sees class-level results for this case.</p>
 </section>;
}
