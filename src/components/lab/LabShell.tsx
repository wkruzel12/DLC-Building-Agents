'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useLab} from './FlowProvider';
import {Icon} from './ui';
const pages=[{href:'/',title:'Case Upload',detail:'Choose your challenge'},{href:'/scenario',title:'Scenario Briefing',detail:'Understand the context'},{href:'/workbench',title:'AI Agent Builder',detail:'Design your workflow'},{href:'/results',title:'Feedback & Results',detail:'Learn and improve'},{href:'/stakeholders',title:'Stakeholders',detail:'Defend your decisions'}];

export function LabShell({children}:{children:React.ReactNode}){
 const path=usePathname(),lab=useLab();
 const current=Math.max(0,pages.findIndex(page=>page.href===path));
 return <div className="lab-app"><header className="topbar"><Link href="/" className="brand" aria-label="Agent Lab home"><span className="brand-symbol"><Icon name="layers" size={23}/></span><span>Agent Lab<span className="brand-period">.</span></span></Link><div className="topbar-right"><span className="workspace-label">STUDENT WORKSPACE</span><span className="environment"><span className="status-dot"/>{lab.local?'Local development':'Authenticated workspace'}</span>{!lab.local&&<button className="text-button" onClick={lab.signOut} disabled={lab.running}>Sign out</button>}</div></header>
 <div className="app-grid"><aside className="sidebar"><div className="sidebar-label">YOUR LEARNING PATH</div><nav aria-label="Learning steps"><ol className="step-list">{pages.map((page,index)=>{
  const disabled=lab.running||(index>0&&!lab.reference&&(index!==3||!lab.active))||(index>=3&&!lab.active);
  return <li key={page.href}><Link href={page.href} aria-current={index===current?'step':undefined} aria-disabled={disabled} onClick={event=>{if(disabled)event.preventDefault();}} className={'step-link '+(index===current?'step-active':'')+(disabled?' step-disabled':'')}><span className={'step-number '+(index<current?'step-done':'')}>{index<current?<Icon name="check" size={16}/>:String(index+1).padStart(2,'0')}</span><span><strong>{page.title}</strong><small>{page.detail}</small></span></Link></li>;
 })}</ol></nav><div className="sidebar-bottom"><Icon name="shield" size={22}/><strong>A safe space to experiment.</strong><p>Build. Test. Reflect. Every attempt is a chance to improve your agent.</p><span className="sidebar-mode">{lab.demo?'Deterministic simulation':'Powered by OpenAI'}</span></div></aside>
 <main className="workspace" id="main-content"><div className="breadcrumb">Agent Lab <span>/</span> {pages[current].title}<span className="step-count">STEP {current+1} OF 5</span></div>{lab.error&&<div className="alert" role="alert"><span>{lab.error}</span><button aria-label="Dismiss message" className="text-button" onClick={()=>lab.setError('')}>×</button></div>}{lab.ready?children:<section className="card empty-state" role="status"><span className="spinner"/><p>Restoring your workspace…</p></section>}<footer className="workspace-footer"><span>AGENT LAB</span><p>Design thoughtful workflows. Evaluate the evidence. Keep people in the loop.</p></footer></main></div></div>;
}
