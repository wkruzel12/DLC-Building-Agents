'use client';
import {DEFAULT_LEARNING_TARGET,studentAttempt,validReflection,reviewAllowed,type AttemptLearning} from '@/lib/results-learning';
import {createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {User} from '@supabase/supabase-js';
import {browserSupabase} from '@/lib/supabase-browser';
import {canAccessWorkbench,isTcuEmail} from '@/lib/auth-access';
import type {Attempt,CaseReference,Steps} from '@/lib/types';
import {freshProgress,restoreProgress,type BuilderProgress} from '@/lib/builder-progress';
import {inspectRunResponse,type RunOutcome} from '@/lib/combined-builder';
import {ProofworkLogo,ProofworkMark} from '../brand/Logo';

export const defaultSteps:Steps={extract:'',check:'',flag:''};
const historyKey='agent-workbench.local-demo.v1';
const flowKey='agent-lab.flow.v1';
type Drafts=Record<string,Steps>;
type Flow={canReview:boolean;target:number;needsReflection:boolean;updateAttemptLearning:(id:string,value:AttemptLearning)=>void;builder:BuilderProgress;editBuilder:(value:BuilderProgress)=>void;reference:CaseReference|null;chooseCase:(value:CaseReference)=>void;steps:Steps;editSteps:(value:Steps)=>void;history:Attempt[];active:Attempt|null;selectAttempt:(attempt:Attempt,stayInBuilder?:boolean)=>void;reviewAttempt:(attempt?:Attempt)=>void;run:(options?:{stayInBuilder?:boolean;beforeRun?:()=>Promise<void>})=>Promise<RunOutcome>;running:boolean;ready:boolean;error:string;setError:(value:string)=>void;local:boolean;demo:boolean;user:User|null;signOut:()=>void};
const Context=createContext<Flow|null>(null);
export function useLab(){const value=useContext(Context);if(!value)throw Error('Proofwork context is unavailable');return value;}

export function FlowProvider({children,local,demo,target=DEFAULT_LEARNING_TARGET}:{children:React.ReactNode;local:boolean;demo:boolean;target?:number}){
 const router=useRouter();
 const [supabase]=useState(()=>local?null:browserSupabase());
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(local);
 const [ready,setReady]=useState(false),[reference,setReference]=useState<CaseReference|null>(null);
 const [builders,setBuilders]=useState<Record<string,BuilderProgress>>({});
 const [drafts,setDrafts]=useState<Drafts>({}),[history,setHistory]=useState<Attempt[]>([]),[activeId,setActiveId]=useState<string|null>(null);
 const [error,setError]=useState(''),[running,setRunning]=useState(false);
 const runLock=useRef(false),initialized=useRef(false);
 const access=local||canAccessWorkbench(user,demo);
 const identity=local?'local':user?.id;
 const storageKey=flowKey+'.'+identity;
 const currentIdentity=useRef(identity);currentIdentity.current=identity;

 useEffect(()=>{
  if(!supabase)return;
  let mounted=true;
  void supabase.auth.getUser().then(({data:{user}})=>{if(mounted){setUser(user);setAuthReady(true);}}).catch(()=>{if(mounted)setAuthReady(true);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(mounted){setUser(session?.user||null);setAuthReady(true);}});
  return()=>{mounted=false;subscription.unsubscribe();};
 },[supabase]);

 useEffect(()=>{
  if(!authReady||!access)return;
  const controller=new AbortController();initialized.current=false;setReady(false);setReference(null);setHistory([]);setActiveId(null);setDrafts({});setBuilders({});setError('');
  async function restore(){
   let stored:{caseId?:string;drafts?:Drafts;builders?:Record<string,BuilderProgress>;activeId?:string}={};
   try{
    stored=JSON.parse((local?localStorage:sessionStorage).getItem(storageKey)||'{}');
    if(!stored||typeof stored!=='object')stored={};
    const validDrafts:Drafts={};
    for(const [id,value] of Object.entries(stored.drafts||{})){if(value&&['extract','check','flag'].every(key=>typeof value[key as keyof Steps]==='string'&&value[key as keyof Steps].length<=100000))validDrafts[id]=value;}
    if(!controller.signal.aborted){setDrafts(validDrafts);setBuilders(stored.builders&&typeof stored.builders==='object'?stored.builders:{});setActiveId(stored.activeId||null);}
    if(local){
     const saved:unknown=JSON.parse(localStorage.getItem(historyKey)||'[]');
     if(Array.isArray(saved)&&!controller.signal.aborted){const cleaned=saved.filter((item:Attempt)=>item?.storage==='local'&&['demo','openai'].includes(item.mode)&&Array.isArray(item.results)&&Number.isInteger(item.attempt_number)).map(item=>studentAttempt({...item,case_id:item.case_id||'resume-screener'}));setHistory(cleaned);localStorage.setItem(historyKey,JSON.stringify(cleaned));}
    }
   }catch{if(!controller.signal.aborted)setError('Saved browser data could not be restored. You can start a new case.');}
   if(stored.caseId){
    try{
     const response=await fetch('/api/cases/'+encodeURIComponent(stored.caseId),{cache:'no-store',signal:controller.signal});
     const value=await response.json();
     if(!response.ok)throw Error(value.error||'Could not restore this case.');
     if(!controller.signal.aborted)setReference(value);
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'Could not restore this case.');}
   }
   if(!controller.signal.aborted){initialized.current=true;setReady(true);}
  }
  void restore();return()=>controller.abort();
 },[authReady,access,identity,local,storageKey]);

 useEffect(()=>{
  if(!ready||!initialized.current)return;
  try{(local?localStorage:sessionStorage).setItem(storageKey,JSON.stringify({caseId:reference?.case_id,drafts,builders,activeId}));}catch{setError('Browser storage is unavailable. Instructions may not survive a refresh.');}
 },[reference,drafts,builders,activeId,ready,local,storageKey]);

 useEffect(()=>{
  if(local||!reference)return;
  const controller=new AbortController();
  void fetch('/api/history?case_id='+encodeURIComponent(reference.case_id),{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error('Could not load your saved attempts.');
   const data:Attempt[]=await response.json();
   if(!controller.signal.aborted)setHistory(data.map(item=>({...item,case_id:reference.case_id,scenario_title:reference.scenario.title,records:reference.scenario.items})));
  }).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
  return()=>controller.abort();
 },[local,reference]);

 const chooseCase=useCallback((value:CaseReference)=>{setReference(value);setActiveId(null);setError('');},[]);
 const steps=reference?drafts[reference.case_id]||defaultSteps:defaultSteps;
 function editSteps(value:Steps){if(reference)setDrafts(previous=>({...previous,[reference.case_id]:value}));}
 const builder=reference?restoreProgress(builders[reference.case_id],reference.scenario.items.map(item=>item.id)):freshProgress();
 function editBuilder(value:BuilderProgress){if(reference&&currentIdentity.current===identity)setBuilders(previous=>({...previous,[reference.case_id]:value}));}
 const relevant=history.filter(item=>item.case_id===(reference?.case_id||history.find(row=>row.id===activeId)?.case_id));
 const active=relevant.find(item=>item.id===activeId)||relevant[0]||null;
 const latest=[...relevant].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.attempt_number-a.attempt_number)[0];
 const needsReflection=Boolean(latest&&latest.accuracy<target&&!validReflection(latest.learning?.reflection||''));
 function updateAttemptLearning(id:string,value:AttemptLearning){if(currentIdentity.current!==identity)return;setHistory(previous=>{const next=previous.map(attempt=>attempt.id===id?{...attempt,learning:value}:attempt);if(local){try{localStorage.setItem(historyKey,JSON.stringify(next));}catch{setError('The reflection was saved on the server, but browser storage could not be updated.');}}return next;});}
 const completedTotal=Math.max(relevant.length,...relevant.map(a=>a.completed_count||0));
 const canReview=reviewAllowed(active,target,completedTotal);
 function selectAttempt(attempt:Attempt,stayInBuilder=false){setActiveId(attempt.id);if(!stayInBuilder)router.push('/results');}
 function reviewAttempt(attempt?:Attempt){const selected=attempt||active;if(selected){setActiveId(selected.id);if(!reviewAllowed(selected,target,completedTotal)){setError('Review your results first. After three completed simulations, you can acknowledge a below-target score and continue to stakeholders.');router.push('/results');return;}router.push('/stakeholders');}}

 async function run(options?:{stayInBuilder?:boolean;beforeRun?:()=>Promise<void>}):Promise<RunOutcome>{
  if(runLock.current||!reference)return {kind:'failed'};
  if(needsReflection){setActiveId(latest.id);setError('Save a brief reflection on your latest attempt before testing again.');if(!options?.stayInBuilder)router.push('/results');return {kind:'failed'};}
  if(Object.values(steps).some(value=>value.trim().length<10||value.length>1500)){setError('Each instruction field needs between 10 and 1,500 characters. Your full draft is saved.');return {kind:'failed'};}
  runLock.current=true;setRunning(true);setError('');
  try{
   await options?.beforeRun?.();
   const response=await fetch(local?'/api/local-demo':'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case_id:reference.case_id,steps})});
   const body=await response.json();if(!response.ok)throw Error(response.status===401||response.status===403?'Your session needs attention. Sign in again before testing.':response.status===429?'AI testing is busy or its credits are unavailable. Wait a moment and try again.':response.status>=500?'The AI could not finish this test. Try again shortly; your instructions are saved.':body.error||'The agent could not complete this run.');
   const inspected=inspectRunResponse(body,reference.scenario,steps);if(inspected.kind==='incomplete')return inspected;
   const next:Attempt={...inspected.attempt,case_id:reference.case_id,scenario_title:reference.scenario.title,records:reference.scenario.items};
   if(local){
    next.storage='local';next.attempt_number=body.attempt_number>0?body.attempt_number:Math.max(0,...history.filter(item=>item.case_id===reference.case_id).map(item=>item.attempt_number))+1;
   }
   const nextHistory=[next,...history];setHistory(nextHistory);setActiveId(next.id);
   if(local){try{localStorage.setItem(historyKey,JSON.stringify(nextHistory));}catch{setError('Run completed, but browser storage is full or unavailable. This attempt will be lost on refresh.');}}
   if(!options?.stayInBuilder)router.push('/results');
   return {kind:'complete',attempt:next};
  }catch(error){setError(error instanceof TypeError?'Could not connect. Check your connection and retry.':error instanceof SyntaxError?'The AI response could not be read. Please retry. Your instructions are saved.':error instanceof Error?error.message:'Run failed. Please retry.');return {kind:'failed'};}finally{runLock.current=false;setRunning(false);}
 }
 async function signOut(){if(!supabase)return;const {error}=await supabase.auth.signOut();if(error)setError(error.message);else{setReference(null);setHistory([]);setActiveId(null);setUser(null);initialized.current=false;setReady(false);router.push('/');}}

 if(!authReady)return <div className="boot-screen"><ProofworkMark size={32}/><span>Opening Proofwork…</span></div>;
 if(!access)return <AccessPanel demo={demo} supabase={supabase!}/>;
 return <Context.Provider value={{canReview,target,needsReflection,updateAttemptLearning,builder,editBuilder,reference,chooseCase,steps,editSteps,history:relevant,active,selectAttempt,reviewAttempt,run,running,ready,error,setError,local,demo,user,signOut}}>{children}</Context.Provider>;
}

function AccessPanel({demo,supabase}:{demo:boolean;supabase:ReturnType<typeof browserSupabase>}){
 const [email,setEmail]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function enter(event:React.FormEvent){event.preventDefault();if(busy)return;setError('');const label=email.trim().toLowerCase();if(!isTcuEmail(label)){setError('Use a valid @tcu.edu email address.');return;}setBusy(true);
  try{const {error}=demo?await supabase.auth.signInAnonymously({options:{data:{demo_email_label:label}}}):await supabase.auth.signInWithOtp({email:label,options:{emailRedirectTo:window.location.origin+'/auth/callback'}});if(error)throw error;if(!demo)setError('Check your TCU email for the verification link.');}catch(error){setError(error instanceof Error?error.message:'Could not sign in.');}finally{setBusy(false);}}
 return <main className="auth-screen"><form className="card auth-card" onSubmit={enter}><ProofworkLogo size={30}/><h1>Sign in to Proofwork</h1><p>{demo?'Enter a TCU email as an unverified display label to begin.':'Verify your TCU email to access private cases and AI execution.'}</p><label htmlFor="student-email">TCU email{demo?' · unverified display label':''}</label><input id="student-email" className="input" type="email" value={email} onChange={event=>setEmail(event.target.value)} placeholder="student@tcu.edu" required/><button className="button primary" disabled={busy}>{busy?'Connecting…':demo?'Enter Workbench':'Send verification link'}</button>{error&&<p role="status">{error}</p>}</form></main>;
}
