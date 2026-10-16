'use client';
import {useCallback,useEffect,useState} from 'react';
import {browserSupabase} from '@/lib/supabase-browser';
import type {User} from '@supabase/supabase-js';
import {canAccessWorkbench,displayLabel,isTcuEmail} from '@/lib/auth-access';
import type {Attempt,PublicScenario,Steps,ApplicantResult} from '@/lib/types';
import {formatDecision} from '@/lib/decisions';
const defaults:Steps={extract:'Extract education, Excel and SQL experience, relevant professional experience, and communication evidence from the resume. Do not assume missing facts.',check:'Compare all extracted evidence to the stated job requirements. Consider equivalent relevant professional experience and identify skills that cannot be verified.',flag:'Advance applicants who qualify, reject those who clearly do not, and route ambiguous or incomplete evidence to human_review. Explain briefly.'};
const stages=[{id:'extract',name:'1. Extract',hint:'What information should the AI identify?'},{id:'check',name:'2. Check',hint:'How should the AI compare the evidence to the job requirements?'},{id:'flag',name:'3. Flag',hint:'How should it decide, including when a person should review?'}] as const;
const short=formatDecision;
const localHistoryKey='agent-workbench.local-demo.v1';
export default function Workbench({demoMode,localDemo=false}:{demoMode:boolean;localDemo?:boolean}){
 const [supabase]=useState(()=>localDemo?null:browserSupabase());const [email,setEmail]=useState('');const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(!localDemo);const [sending,setSending]=useState(false);const [running,setRunning]=useState(false);const [notice,setNotice]=useState('');const [scenario,setScenario]=useState<PublicScenario|null>(null);const [steps,setSteps]=useState<Steps>(defaults);const [history,setHistory]=useState<Attempt[]>([]);const [active,setActive]=useState<Attempt|null>(null);const [selected,setSelected]=useState<ApplicantResult|null>(null);
 const reload=useCallback(async(signal:AbortSignal)=>{
  const [s,h]=await Promise.all([fetch('/api/scenario',{cache:'no-store',signal}),fetch('/api/history',{cache:'no-store',signal})]);
  const nextScenario:PublicScenario|null=s.ok?await s.json():null;
  const nextHistory:Attempt[]|null=h.ok?await h.json():null;
  if(signal.aborted)return;
  setScenario(nextScenario);
  if(nextHistory){setHistory(nextHistory);setActive(nextHistory[0]||null);}else setNotice('Could not load your attempt history.');
  if(!s.ok)setNotice('Your session could not access the workbench. Please sign out and enter again.');
 },[]);
 useEffect(()=>{
  if(!supabase)return;
  let mounted=true;
  void supabase.auth.getUser().then(({data:{user},error})=>{if(mounted){setUser(error?null:user);setLoading(false)}}).catch(()=>{if(mounted){setNotice('Could not restore your session. Please try entering again.');setLoading(false)}});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(mounted){setUser(session?.user??null);setLoading(false)}});
  return()=>{mounted=false;subscription.unsubscribe()};
 },[supabase]);
 const hasAccess=localDemo||canAccessWorkbench(user,demoMode);
 const userId=hasAccess?user?.id:null;
 useEffect(()=>{
  const controller=new AbortController();
  if(localDemo){
   try{
    const saved=JSON.parse(localStorage.getItem(localHistoryKey)||'[]');
    if(!Array.isArray(saved))throw Error('Invalid local history');
    const attempts:Attempt[]=saved.filter((item:Attempt)=>item?.storage==='local'&&(item.mode==='demo'||item.mode==='openai')&&Array.isArray(item.results)&&Number.isInteger(item.attempt_number));
    setHistory(attempts);setActive(attempts[0]||null);
   }catch{setNotice('Local history could not be read. New runs can still be tested.');}
   void fetch('/api/local-demo',{cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw Error('Local demo unavailable');const data:PublicScenario=await response.json();if(!controller.signal.aborted)setScenario(data);}).catch(()=>{if(!controller.signal.aborted)setNotice('Could not load the local workbench. Restart the development server and retry.');});
   return()=>controller.abort();
  }
  setScenario(null);setHistory([]);setActive(null);setSelected(null);
  if(userId)void reload(controller.signal).catch(()=>{if(!controller.signal.aborted)setNotice('Could not load the workbench. Please refresh to retry.');});
  return()=>controller.abort();
 },[userId,reload,localDemo]);
 async function signIn(){
  if(sending||!supabase)return;
  setNotice('');const label=email.trim().toLowerCase();
  if(!isTcuEmail(label)){setNotice('Enter a valid @tcu.edu email address as your unverified display label.');return;}
  if(!demoMode){setNotice('Instant entry is available only in demo mode. Verified student authentication is required for live AI access.');return;}
  setSending(true);
  try{
   const {data:{user:existing}}=await supabase.auth.getUser();
   if(canAccessWorkbench(existing,demoMode)){setUser(existing);return;}
   const {data,error}=await supabase.auth.signInAnonymously({options:{data:{demo_email_label:label}}});
   if(error)throw error;
   if(!data.user)throw Error('Could not create a demo session.');
   setUser(data.user);
  }catch(error){setNotice(error instanceof Error?error.message:'Could not enter the demo. Please retry.');}finally{setSending(false);}
 }
 async function signOut(){if(!supabase)return;const {error}=await supabase.auth.signOut();if(error){setNotice(error.message);return;}setUser(null);setScenario(null);setHistory([]);setActive(null);setSelected(null);setNotice('');}
 async function run(){if(running||!scenario)return;setNotice('');setRunning(true);try{const res=await fetch(localDemo?'/api/local-demo':'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case_id:scenario.id,steps})});const body=await res.json();if(!res.ok)throw Error(body.error||'Could not run agent');const next=body as Attempt;
 if(localDemo){
  next.storage='local';next.attempt_number=Math.max(0,...history.map(item=>item.attempt_number))+1;
  const attempts=[next,...history];setHistory(attempts);
  try{localStorage.setItem(localHistoryKey,JSON.stringify(attempts));setNotice(next.errors>0?'Some applicants could not be processed. Inspect their stage outputs and errors. Attempt saved locally.':next.mode==='openai'?'OpenAI attempt saved in this browser only; not persisted to Supabase.':'Local demo data saved in this browser only; not persisted to Supabase.');}catch{setNotice('Run completed, but browser storage is unavailable or full. This attempt will be lost on refresh.');}
 }else{setHistory(prev=>[next,...prev]);setNotice(next.mode==='demo'?'Demo attempt saved in Supabase. Connect OpenAI to run the real model.':'AI attempt completed and saved to Supabase.');}setActive(next);setSelected(null)}catch(e){setNotice(e instanceof Error?e.message:'An error occurred')}finally{setRunning(false)}}
 function openAttempt(a:Attempt){setActive(a);setSelected(null)}
 if(loading)return <main className="max-w-6xl mx-auto p-8">Loading workbench…</main>;
 if(!hasAccess)return <main className="min-h-screen flex items-center justify-center p-5"><section className="panel p-9 w-full max-w-lg"><div className="text-indigo-600 font-bold text-sm tracking-widest">AGENT LAB</div><h1 className="text-3xl font-bold mt-3">Student demo entry</h1><p className="muted mt-3">Build, test, and improve your own three-stage AI agent. Your TCU email is an unverified display label; no verification email is sent.</p><form className="mt-7 space-y-3" onSubmit={e=>{e.preventDefault();void signIn()}}><label htmlFor="email" className="font-semibold text-sm">TCU email (unverified display label)</label><input id="email" type="email" className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="student@tcu.edu" required/><button className="btn primary w-full" disabled={sending}>{sending?'Entering...':'Enter Workbench'}</button></form>{notice&&<p role="status" className="small mt-4">{notice}</p>}</section></main>;
 return <main className="max-w-7xl mx-auto px-4 sm:px-7 py-7"><header className="header flex items-center justify-between gap-4 mb-7"><div><div className="text-indigo-600 font-bold text-xs tracking-[.2em]">AGENT LAB / STUDENT WORKBENCH</div><h1 className="text-3xl font-bold mt-1">Build your hiring agent</h1><p className="muted mt-1">Design → Test → Review → Improve</p></div><div className="flex items-center gap-3">{localDemo?<span className="chip neutral">{demoMode?'LOCAL DEMO':'LOCAL AI'}</span>:<><span className="small muted">{user?displayLabel(user):''}{user?.is_anonymous?' (unverified)':''}</span><button className="btn secondary small" onClick={()=>void signOut()}>Sign out</button></>}</div></header>
 {localDemo&&<p className="small muted mb-4">{demoMode?'Local demo data: ':'Real OpenAI processing: '}attempts are saved in this browser only, not in Supabase. Clearing browser storage removes this history.</p>}
 {notice&&<div role="status" className="panel p-3 mb-5 text-sm border-indigo-200">{notice}</div>}
 {!scenario?<div className="panel p-8">Loading scenario…</div>:<><div className="panel p-6 mb-6"><div className="flex flex-wrap justify-between gap-2"><span className="chip neutral">SCENARIO 01 · {scenario.items.length} APPLICANTS</span><span className="small muted">Resume screening / simulated candidates</span></div><h2 className="text-2xl font-bold mt-3">{scenario.title}</h2><p className="mt-3">{scenario.story}</p><p className="mt-2"><strong>Your task:</strong> {scenario.task}</p><div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="font-semibold text-sm mb-1">Job requirements</div><p className="text-sm">{scenario.requirements}</p></div></div>
 <div className="columns grid grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)] gap-6 mb-6"><section className="panel p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Agent instructions</h2><span className="chip neutral">3 stages</span></div><p className="muted small mt-1 mb-5">Your instructions are used separately at each step for every applicant.</p><div className="space-y-5">{stages.map(stage=><div key={stage.id}><div className="flex justify-between items-center mb-1"><label htmlFor={stage.id} className="font-bold">{stage.name}</label><span className="small muted">{steps[stage.id].length}/1500</span></div><p className="small muted mb-2">{stage.hint}</p><textarea id={stage.id} className="input" rows={4} maxLength={1500} value={steps[stage.id]} onChange={e=>setSteps({...steps,[stage.id]:e.target.value})}/></div>)}</div><div className="flex flex-wrap items-center gap-3 mt-6"><button className="btn primary" onClick={()=>void run()} disabled={running||stages.some(s=>steps[s.id].trim().length<10)}>{running?'Running all applicants…':'▶ Run all five resumes'}</button><button className="btn secondary" disabled={running} onClick={()=>setSteps(defaults)}>Restore starter instructions</button></div><p className="small muted mt-3">{localDemo?'Each run creates a locally saved attempt. Revise the instructions and run again.':'Each run creates a separate, saved attempt. Maximum 15 per hour. AI runs can take time; leave the tab open until results appear.'}</p></section>
 <aside className="panel p-5 self-start"><h2 className="text-xl font-bold">Attempt history</h2><p className="small muted mt-1 mb-4">{localDemo?'Select a locally saved attempt to inspect earlier scores. History persists across refreshes on this browser and address.':'Select an attempt to inspect earlier scores. Demo history is tied to this browser session and may not transfer to other devices. Signing out or clearing browser data may remove access.'}</p>{history.length===0?<p className="small muted">No runs yet. Run the agent to create your first attempt.</p>:<div className="space-y-2 max-h-[530px] overflow-y-auto">{history.map(a=><button key={a.id} onClick={()=>openAttempt(a)} className={`w-full text-left border rounded-xl p-3 ${active?.id===a.id?'border-indigo-500 bg-indigo-50':'border-slate-200 bg-white'}`}><div className="flex justify-between items-center"><strong>Attempt {a.attempt_number}</strong><span className="chip neutral">{a.storage==='local'?(a.mode==='demo'?'LOCAL DEMO':'LOCAL AI'):a.mode==='demo'?'DEMO':'AI'}</span></div><div className="small muted mt-1">{new Date(a.created_at).toLocaleString()}</div><div className="flex justify-between mt-3 text-sm"><span>{a.accuracy}% accurate</span><span>{a.planted_caught}/{a.planted_total} planted</span></div></button>)}</div>}</aside></div>
 <section className="panel p-6"><div className="flex flex-wrap justify-between gap-3 items-start"><div><h2 className="text-xl font-bold">Results {active?`· Attempt ${active.attempt_number}`:''}</h2><p className="muted small mt-1">Click an applicant to inspect all three stage outputs.</p></div>{active&&<span className="chip neutral">{active.mode==='demo'?'Simulated results — not AI generated':'OpenAI results'}</span>}</div>{!active?<div className="bg-slate-50 rounded-xl mt-5 p-9 text-center muted">Run your agent to see applicant decisions and scores.</div>:<><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5"><div className="metric"><div className="small muted">Overall accuracy</div><div className="text-3xl font-bold mt-1">{active.accuracy}%</div></div><div className="metric"><div className="small muted">Planted cases caught</div><div className="text-3xl font-bold mt-1">{active.planted_caught}/{active.planted_total}</div></div><div className="metric"><div className="small muted">Matched decisions</div><div className="text-3xl font-bold mt-1">{active.results.filter(r=>r.match).length}/{active.results.length}</div></div><div className="metric"><div className="small muted">Execution errors</div><div className="text-3xl font-bold mt-1">{active.errors}</div></div></div><div className="overflow-x-auto mt-5"><table><thead><tr><th>Applicant</th><th>Agent decision</th><th>Answer key</th><th>Result</th><th></th></tr></thead><tbody>{active.results.map(r=><tr key={r.item_id} className="selectable" onClick={()=>setSelected(r)}><td className="font-semibold">{r.label}</td><td>{short(r.decision)}</td><td>{short(r.expected_decision)}</td><td><span className={`chip ${r.match?'yes':'no'}`}>{r.match?'✓ Match':'✕ Miss'}</span></td><td className="text-indigo-600">Inspect →</td></tr>)}</tbody></table></div><p className="small muted mt-3">Answer-key explanations are intentionally withheld. Use the intermediate outputs to diagnose errors.</p></> }</section>
 {active&&selected&&<section className="panel p-6 mt-5"><div className="flex justify-between gap-3"><div><h2 className="text-xl font-bold">{selected.label} · Agent trace</h2><p className="small muted mt-1">The outputs below show how information flowed between stages.</p></div><button className="btn secondary" onClick={()=>setSelected(null)}>Close</button></div>{stages.map(stage=><div key={stage.id} className="rounded-xl border border-slate-200 mt-4 p-4"><h3 className="font-bold">{stage.name}</h3><pre className="whitespace-pre-wrap break-words text-sm mt-2 font-sans">{selected.outputs[stage.id]||'No output captured.'}</pre></div>)}{selected.error&&<p className="mt-3 text-red-700">Error: {selected.error}</p>}</section>}
 </>}</main>
}
