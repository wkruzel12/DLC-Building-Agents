'use client';
import {Fragment,type ReactNode} from 'react';
import {outputLabel,outputTextBlocks,presentOutput,type OutputValue} from '../../lib/output-presentation';
import type {Decision} from '../../lib/types';
import {DecisionLabel} from './ui';

export function OutputSection({title,kind='ai',children}:{title:string;kind?:'ai'|'evaluation'|'guidance';children:ReactNode}){
 return <section className={'output-section output-'+kind} aria-label={title}><h4 className="output-section-heading">{title}</h4>{children}</section>;
}

function InlineText({text}:{text:string}){
 const parts:ReactNode[]=[];let start=0;
 for(const match of text.matchAll(/\*\*([^*\n]+)\*\*|`([^`\n]+)`/g)){
  const index=match.index!;
  if(index>0&&text[index-1]==='\\')continue;
  parts.push(text.slice(start,index),match[1]!==undefined?<strong key={index}>{match[1]}</strong>:<code key={index}>{match[2]}</code>);start=index+match[0].length;
 }
 parts.push(text.slice(start));return <>{parts}</>;
}

export function ReadableText({text}:{text:string}){
 return <div className="output-prose">{outputTextBlocks(text).map((block,index)=>block.kind==='list'?<ul className="output-text-list" key={index}>{block.items.map((item,next)=><li key={next} style={{paddingLeft:Math.min(item.indent,24)*0.35+'em'}}><span className="output-list-marker">{item.marker}</span><span><InlineText text={item.text}/></span></li>)}</ul>:block.kind==='heading'?<h5 key={index}><InlineText text={block.text}/></h5>:block.kind==='code'?<pre className="output-code" key={index}>{block.text}</pre>:<p key={index}><InlineText text={block.text}/></p>)}</div>;
}

function Value({value}:{value:OutputValue}){
 switch(value.kind){
  case 'text':return value.text?<ReadableText text={value.text}/>:<span className="output-not-provided">Empty text</span>;
  case 'number':return <span className="output-scalar">{value.text}</span>;
  case 'boolean':return <span className="output-scalar">{String(value.value)}</span>;
  case 'null':return <span className="output-not-provided">Not provided</span>;
  case 'array':return value.items.length?<ul className="output-values">{value.items.map((item,index)=><li key={index}><Value value={item}/></li>)}</ul>:<span className="output-not-provided">No entries returned</span>;
  case 'object':return value.fields.length?<dl className="output-fields">{value.fields.map((field,index)=><Fragment key={index}><dt>{outputLabel(field.key)}</dt><dd><Value value={field.value}/></dd></Fragment>)}</dl>:<span className="output-not-provided">No fields returned</span>;
 }
}

export function OriginalResponse({text}:{text:string}){
 return <details className="output-original"><summary>Original response</summary><pre>{text}</pre></details>;
}

export function AiOutput({value,showOriginal=false,emptyText='No output was recorded.'}:{value:string|null|undefined;showOriginal?:boolean;emptyText?:string}){
 const output=presentOutput(value);
 return <div className="ai-output">{output.kind==='empty'?<p className="output-not-provided">{emptyText}</p>:<>{output.kind==='structured'?<Value value={output.value}/>:<>{output.unstructured&&<p className="output-format-note">Shown as text because the response is not fully structured.</p>}<ReadableText text={output.text}/></>}{showOriginal&&<OriginalResponse text={output.original}/>}</>}</div>;
}

// Use the already validated decision and reason instead of rendering the same
// information again from the serialized flag response.
export function DecisionOutput({decision,reason,original}:{decision:Decision;reason?:string;original?:string}){
 return <div className="decision-output"><DecisionLabel value={decision}/><AiOutput value={reason} emptyText="No explanation was recorded."/>{original&&<OriginalResponse text={original}/>}</div>;
}
