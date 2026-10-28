'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLab} from '../lab/FlowProvider';
import {useRole} from '../lab/useRole';
import {Icon,PageHeading} from '../lab/ui';
import {formatJoinCode} from '@/lib/roles';
import type {ClassSummary} from '@/lib/class-analytics';

type PublishedCase={case_id:string;join_code:string;created_at:string;title:string;records:number;enrolled:number};
type Dashboard={case_id:string;title:string;summary:ClassSummary};

async function readJson<T>(response:Response):Promise<T>{const body=await response.json();if(!response.ok)throw Error([body.error,...(body.issues||[])].filter(Boolean).join(' ')||'Request failed.');return body as T;}
const percent=(value:number|null)=>value===null?'—':value+'%';

export function InstructorDashboard(){
 const lab=useLab(),role=useRole(lab.user?.id),input=useRef<HTMLInputElement>(null);
 const [cases,setCases]=useState<PublishedCase[]|null>(null),[selected,setSelected]=useState<string|null>(null),[dashboard,setDashboard]=useState<Dashboard|null>(null);
 const [uploading,setUploading]=useState(false),[loadingClass,setLoadingClass]=useState(false),[message,setMessage]=useState<{kind:'error'|'success';text:string}|null>(null),[copied,setCopied]=useState('');

 const loadCases=useCallback(async(select?:string)=>{
  try{const list=await readJson<PublishedCase[]>(await fetch('/api/instructor/cases',{cache:'no-store'}));setCases(list);setSelected(current=>select||current||list[0]?.case_id||null);}
  catch(error){setCases([]);setMessage({kind:'error',text:error instanceof Error?error.message:'Could not load your cases.'});}
 },[]);
 useEffect(()=>{if(role.instructor)void loadCases();},[role.instructor,loadCases]);

 const loadDashboard=useCallback(async(caseId:string,signal?:AbortSignal)=>{
  setLoadingClass(true);
  try{const value=await readJson<Dashboard>(await fetch('/api/instructor/dashboard?case_id='+encodeURIComponent(caseId),{cache:'no-store',signal}));if(!signal?.aborted)setDashboard(value);}
  catch(error){if(!signal?.aborted){setDashboard(null);setMessage({kind:'error',text:error instanceof Error?error.message:'Could not load class results.'});}}
  finally{if(!signal?.aborted)setLoadingClass(false);}
 },[]);
 useEffect(()=>{if(!selected)return;const controller=new AbortController();void loadDashboard(selected,controller.signal);return()=>controller.abort();},[selected,loadDashboard]);

 async function upload(file:File){
  const pdf=file.name.toLowerCase().endsWith('.pdf');
  if(!pdf&&!file.name.toLowerCase().endsWith('.json')){setMessage({kind:'error',text:'Choose a .pdf or .json case file.'});return;}
  if(file.size>1024*1024){setMessage({kind:'error',text:'Case files must be 1 MB or smaller.'});return;}
  setUploading(true);setMessage(null);
  try{
   const body=await readJson<{case_id:string;join_code?:string;scenario:{title:string}}>(await fetch('/api/cases',{method:'POST',headers:{'Content-Type':pdf?'application/pdf':'application/json'},body:file}));
   if(!body.join_code)throw Error('The case uploaded, but no join code was created. Check that classroom mode is configured.');
   setMessage({kind:'success',text:`“${body.scenario.title}” is ready. Share join code ${formatJoinCode(body.join_code)} with your class.`});
   await loadCases(body.case_id);
  }catch(error){setMessage({kind:'error',text:error instanceof Error?error.message:'Upload failed. Please retry.'});}
  finally{setUploading(false);}
 }
 async function copy(code:string){try{await navigator.clipboard.writeText(formatJoinCode(code));setCopied(code);setTimeout(()=>setCopied(''),2000);}catch{setMessage({kind:'error',text:'Copy is unavailable in this browser. Select the code instead.'});}}

 if(!role.loaded)return <section className="empty-state" role="status"><span className="spinner"/><p>Checking your access…</p></section>;
 if(!role.instructor)return <section className="card empty-state"><span className="icon-block"><Icon name="shield" size={26}/></span><h2>This page is for instructors.</h2><p>{lab.local?'The instructor dashboard runs in the signed-in deployment, where class attempts are saved.':'Ask your administrator to add your verified TCU email to the instructor list.'}</p></section>;

 const current=cases?.find(item=>item.case_id===selected);
 return <div className="lesson-page instructor-page">
  <PageHeading step="INSTRUCTOR" title="Class Dashboard" description="Publish a case, share its join code, and see how your class is doing."/>
  {message&&<p className={'upload-message '+(message.kind==='error'?'error-text':'success-text')} role={message.kind==='error'?'alert':'status'}>{message.text}</p>}

  <section className="instructor-grid">
   <aside className="card instructor-cases" aria-labelledby="cases-title">
    <div className="instructor-section-head"><h2 id="cases-title">Your cases</h2>
     <input ref={input} type="file" className="visually-hidden" tabIndex={-1} aria-label="Upload a PDF or JSON case" accept=".json,.pdf,application/json,application/pdf" disabled={uploading} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value='';}}/>
     <button className="button primary" onClick={()=>input.current?.click()} disabled={uploading}>{uploading?'Creating…':'Upload case'}<Icon name="upload" size={16}/></button>
    </div>
    <p className="small-note">PDF or JSON, up to 1 MB. PDFs are converted into a simulation automatically and use AI credits.</p>
    {uploading&&<div className="selection-status"><span className="spinner"/><div><strong>Building the simulation</strong><p>PDFs can take up to a minute. Keep this page open.</p></div></div>}
    {cases===null?<p className="small-note">Loading…</p>:cases.length===0?<p className="small-note">No published cases yet. Upload one to get a join code.</p>:
     <ul className="instructor-case-list">{cases.map(item=><li key={item.case_id}><button className={'instructor-case '+(item.case_id===selected?'is-selected':'')} onClick={()=>setSelected(item.case_id)} aria-pressed={item.case_id===selected}><strong>{item.title}</strong><span className="join-code">{formatJoinCode(item.join_code)}</span><small>{item.enrolled} joined · {item.records} records · {new Date(item.created_at).toLocaleDateString()}</small></button></li>)}</ul>}
   </aside>

   <section className="instructor-main" aria-live="polite">
    {!current?<div className="card empty-state"><span className="icon-block"><Icon name="chart" size={26}/></span><h2>Class results appear here.</h2><p>Upload a case and share its join code. Results show up as students run their agents.</p></div>:<>
     <div className="card instructor-case-head"><div><span className="eyebrow">SELECTED CASE</span><h2>{current.title}</h2></div><div className="instructor-code-box"><span className="eyebrow">JOIN CODE</span><strong className="join-code large">{formatJoinCode(current.join_code)}</strong><div className="instructor-actions"><button className="button secondary" onClick={()=>void copy(current.join_code)}>{copied===current.join_code?'Copied':'Copy code'}</button><button className="button secondary" onClick={()=>void loadDashboard(current.case_id)} disabled={loadingClass}>{loadingClass?'Refreshing…':'Refresh'}</button></div></div></div>
     {loadingClass&&!dashboard?<section className="empty-state" role="status"><span className="spinner"/><p>Loading class results…</p></section>:dashboard&&dashboard.case_id===current.case_id&&<ClassView summary={dashboard.summary}/>}
    </>}
   </section>
  </section>
 </div>;
}

function ClassView({summary}:{summary:ClassSummary}){
 const tiles=[
  {label:'Students joined',value:String(summary.enrolled),note:summary.students+' have run their agent'},
  {label:'Total runs',value:String(summary.runs),note:summary.runs_per_student+' per active student'},
  {label:'Average accuracy',value:percent(summary.average_latest_accuracy),note:'Each student’s latest run'},
  {label:'Reached target',value:summary.students?`${summary.at_target}/${summary.students}`:'—',note:`Best run at or above ${summary.target}%`}
 ];
 return <>
  <section className="card" aria-labelledby="summary-title"><h3 id="summary-title" className="instructor-subhead">Class summary</h3>
   <dl className="instructor-kpis">{tiles.map(tile=><div key={tile.label}><dt>{tile.label}</dt><dd>{tile.value}</dd><small>{tile.note}</small></div>)}</dl>
   {summary.students>0&&<p className="small-note">Average best run {percent(summary.average_best_accuracy)} · highest {percent(summary.highest_accuracy)}</p>}
  </section>
  <section className="card" aria-labelledby="toughest-title"><h3 id="toughest-title" className="instructor-subhead">Toughest records</h3>
   <p className="small-note">Based on each student’s latest run. Records the class misses most are good discussion starters.</p>
   {summary.students===0?<p className="small-note">No runs yet.</p>:<div className="table-scroll"><table className="instructor-table"><thead><tr><th>Record</th><th>Answer key</th><th>Missed by</th><th>Most common wrong answer</th></tr></thead><tbody>{summary.toughest.map(row=><tr key={row.item_id}>
    <td><strong>{row.label}</strong>{row.planted&&<span className="badge badge-blue planted-badge">PLANTED</span>}</td>
    <td>{row.expected}</td>
    <td><div className="miss-cell"><span className="miss-bar" aria-hidden="true"><span style={{width:row.miss_rate+'%'}}/></span><span>{row.miss_rate}% <small>({row.missed}/{row.attempted})</small></span></div></td>
    <td>{row.common_wrong?<>{row.common_wrong} <small>({row.common_wrong_count})</small></>:<span className="small-note">—</span>}</td>
   </tr>)}</tbody></table></div>}
  </section>
 </>;
}
