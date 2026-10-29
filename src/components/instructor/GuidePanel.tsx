'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {useGuideContext} from './GuideContext';
import {ProofworkMark} from '../brand/Logo';

type Message={role:'user'|'assistant';content:string};
const SUGGESTIONS={
 dashboard:['Which records is my class struggling with, and why?','What should I debrief in the next class?','How is average accuracy calculated?','How do students join my case?'],
 create:['Does my case cover my learning outcomes?','Suggest a planted record for my draft','Are my evaluation criteria clear enough?','How do I publish this case?']
} as const;

// Plain text with paragraphs and "- " bullets; no HTML is ever injected.
function Reply({text}:{text:string}){
 const blocks=text.split(/\n{2,}/);
 return <>{blocks.map((block,i)=>{
  const lines=block.split('\n').map(line=>line.trim()).filter(Boolean);
  if(lines.length&&lines.every(line=>/^[-•*]\s+/.test(line)))return <ul key={i}>{lines.map((line,j)=><li key={j}>{line.replace(/^[-•*]\s+/,'').replace(/\*\*/g,'')}</li>)}</ul>;
  return <p key={i}>{block.replace(/\*\*/g,'')}</p>;
 })}</>;
}

export function GuidePanel(){
 const guide=useGuideContext(),path=usePathname();
 const [open,setOpen]=useState(false),[messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const input=useRef<HTMLTextAreaElement>(null),list=useRef<HTMLDivElement>(null),toggle=useRef<HTMLButtonElement>(null);
 const page=path.startsWith('/instructor/new')?'create':'dashboard';
 useEffect(()=>{if(open)setTimeout(()=>input.current?.focus(),0);},[open]);
 useEffect(()=>{list.current?.scrollTo({top:list.current.scrollHeight});},[messages,busy]);
 useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);toggle.current?.focus();}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[open]);

 async function send(text:string){
  const question=text.trim();if(!question||busy)return;
  const next=[...messages,{role:'user' as const,content:question.slice(0,4000)}].slice(-16);
  setMessages(next);setDraft('');setError('');setBusy(true);
  try{
   const context=guide.get();
   const response=await fetch('/api/instructor/guide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:next,page:context.page||page,...(context.case_id?{case_id:context.case_id}:{}),...(context.draft?{draft:context.draft.slice(0,24000)}:{})})});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'Proofwork Guide is unavailable right now.');
   setMessages(current=>[...current,{role:'assistant' as const,content:String(body.reply)}].slice(-16));
  }catch(failure){setError(failure instanceof Error?failure.message:'Proofwork Guide is unavailable right now.');setMessages(current=>current.slice(0,-1));setDraft(question);}
  finally{setBusy(false);}
 }

 return <>
  <button ref={toggle} type="button" className="guide-toggle" aria-expanded={open} aria-controls="proofwork-guide" onClick={()=>setOpen(value=>!value)}>
   <ProofworkMark size={20}/><span>{open?'Close Guide':'Proofwork Guide'}</span>
  </button>
  {open&&<aside id="proofwork-guide" className="guide-panel" aria-label="Proofwork Guide">
   <header className="guide-head">
    <div><strong>Proofwork Guide</strong><small>{page==='create'?'Sees your case draft':'Sees your selected case and class totals'}</small></div>
    <div className="guide-head-actions">{messages.length>0&&<button type="button" className="text-button" onClick={()=>{setMessages([]);setError('');}}>Clear</button>}<button type="button" className="guide-close" aria-label="Close Proofwork Guide" onClick={()=>{setOpen(false);toggle.current?.focus();}}>×</button></div>
   </header>
   <div className="guide-messages" ref={list} aria-live="polite">
    {messages.length===0&&<div className="guide-empty"><p>Ask about the interface, your class's results, or the case you're building.</p><div className="guide-suggestions">{SUGGESTIONS[page].map(item=><button type="button" key={item} onClick={()=>void send(item)}>{item}</button>)}</div></div>}
    {messages.map((message,index)=><div key={index} className={'guide-message guide-'+message.role}>{message.role==='assistant'?<Reply text={message.content}/>:<p>{message.content}</p>}</div>)}
    {busy&&<div className="guide-message guide-assistant guide-thinking" role="status"><span className="spinner"/>Thinking…</div>}
   </div>
   {error&&<p className="guide-error" role="alert">{error}</p>}
   <form className="guide-form" onSubmit={event=>{event.preventDefault();void send(draft);}}>
    <label htmlFor="guide-input" className="visually-hidden">Ask Proofwork Guide</label>
    <textarea id="guide-input" ref={input} rows={2} value={draft} maxLength={4000} placeholder="Ask a question" onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send(draft);}}}/>
    <button type="submit" className="button primary" disabled={busy||!draft.trim()}>Send</button>
   </form>
   <p className="guide-footnote">Answers come from AI and can be wrong. Guide can't change anything in Proofwork.</p>
  </aside>}
 </>;
}
