'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';
import {useLab} from './FlowProvider';
import {Icon} from './ui';
const pages=[{href:'/',title:'Case Upload',icon:'upload'},{href:'/scenario',title:'Scenario Briefing',icon:'file'},{href:'/workbench',title:'AI Agent Builder',icon:'layers'},{href:'/results',title:'Feedback & Results',icon:'chart'},{href:'/stakeholders',title:'Stakeholders',icon:'shield'}] as const;

export function LabShell({children}:{children:React.ReactNode}){
 const path=usePathname(),lab=useLab();
 const [notice,setNotice]=useState('');
 useEffect(()=>setNotice(''),[path]);
 const current=Math.max(0,pages.findIndex(page=>page.href===path));

 const completed=[Boolean(lab.reference),false,Boolean(lab.active),false,false];
 const reasons=[undefined,!lab.reference?'Choose a case first.':undefined,!lab.reference?'Choose a case first.':undefined,!lab.active?'Run your complete agent to see results.':undefined,!lab.active?'Run your complete agent first.':!lab.canReview?'Reach the learning target, or complete three runs and acknowledge your score in Results.':undefined];
 const lockedReason=lab.running?'Wait for your agent to finish.':reasons[current]||notice;
 return <div className="lab-app guided-app agent-theme"><a href="#main-content" className="skip-link">Skip to workspace</a><header className="topbar"><Link href="/" className="brand" aria-label="Agent Lab home" aria-disabled={lab.running} onClick={event=>{if(lab.running)event.preventDefault();}}><span className="brand-symbol"><Icon name="layers" size={23}/></span><span>Agent Lab<span className="brand-period">.</span></span></Link><div className="topbar-right"><span className="workspace-label">LEARN BY BUILDING</span><span className="environment">{lab.local?'Local development':'Authenticated workspace'}</span>{!lab.local&&<button className="text-button" onClick={lab.signOut} disabled={lab.running}>Sign out</button>}</div><nav className="journey-progress" aria-label="Simulation progress"><div className="journey-caption"><span>Your learning journey</span><span>Step {current+1} of {pages.length}</span></div><ol>{pages.map((page,index)=>{
  const reason=lab.running?'Wait for your agent to finish.':reasons[index],disabled=Boolean(reason)&&index!==current,done=completed[index]&&index!==current;
  return <li key={page.href}><Link href={page.href} aria-current={index===current?'step':undefined} aria-disabled={disabled||lab.running} aria-describedby={reason?'journey-lock-'+index:undefined} onClick={event=>{if(disabled||lab.running){event.preventDefault();setNotice(reason||'Finish the current step first.');}}} className={'journey-step '+(index===current?'is-current':done?'is-complete':'')}><span className="journey-number" aria-hidden="true">{done?<Icon name="check" size={16}/>:<Icon name={page.icon} size={17}/>}</span><span><strong>{page.title}</strong><small>{index===current?'Current tab':done?index===0?'Case ready':'Run complete':disabled?'Not yet available':'Available'}</small></span></Link>{reason&&<span id={'journey-lock-'+index} className="visually-hidden">{reason}</span>}</li>;
 })}</ol></nav></header>
 <div className="journey-shell"><main className="workspace" id="main-content" tabIndex={-1}>{lockedReason&&<p className="journey-notice" role="status">{lockedReason}</p>}{lab.error&&<div className="alert" role="alert"><span>{lab.error}</span><button aria-label="Dismiss message" className="text-button" onClick={()=>lab.setError('')}>×</button></div>}{lab.ready?children:<section className="empty-state" role="status"><span className="spinner"/><p>Opening your workspace…</p></section>}<footer className="workspace-footer"><span>AGENT LAB</span><p>Find evidence. Test your thinking. Keep people in the loop.</p></footer></main></div></div>;
}
