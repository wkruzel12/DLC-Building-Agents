import Link from 'next/link';
import {decisionParts,formatDecision,type Decision} from '@/lib/decisions';

export function Icon({name,size=20}:{name:'upload'|'file'|'arrow'|'back'|'check'|'layers'|'chart'|'spark'|'shield';size?:number}){
 const paths={upload:<><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 15v5h16v-5"/></>,file:<><path d="M14 3H5v18h14V8z"/><path d="M14 3v6h5M8 13h8M8 17h5"/></>,arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,back:<path d="M20 12H4m6-6-6 6 6 6"/>,check:<path d="m5 12 4 4L19 6"/>,layers:<><path d="m12 3 10 6-10 6L2 9z"/><path d="m2 14 10 6 10-6"/></>,chart:<><path d="M4 3v18h17M9 17v-5m5 5V8m5 9V4"/></>,spark:<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>,shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/></>};
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function PageHeading({step,title,description,action}:{step:string;title:string;description:string;action?:React.ReactNode}){return <header className="page-heading"><div className="hero-title"><div className="eyebrow">{step}</div><h1>{title}</h1></div><div className="hero-description"><p>{description}</p>{action}</div></header>;}
export function EmptyCase(){return <section className="card empty-state"><span className="icon-block"><Icon name="file" size={26}/></span><h2>Start with a case.</h2><p>Upload a PDF or JSON case, or choose the sample to begin.</p><Link href="/" className="button primary">Choose a case <Icon name="arrow" size={16}/></Link></section>;}
export function DecisionLabel({value}:{value:Decision}){return <span className={'decision decision-'+decisionParts(value).type}>{formatDecision(value)}</span>;}
export function ModeBadge({mode,local}:{mode:'demo'|'openai';local:boolean}){return <span className={'badge '+(mode==='openai'?'badge-blue':'badge-neutral')}>{local?'LOCAL · ':''}{mode==='openai'?'OPENAI':'SIMULATED'}</span>;}
