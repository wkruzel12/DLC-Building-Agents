'use client';
import {Children,Fragment,isValidElement,useId,type ReactNode,type OptionHTMLAttributes} from 'react';

type Option={value:string;label:ReactNode;disabled?:boolean};
function optionsFrom(children:ReactNode):Option[]{
 return Children.toArray(children).flatMap(child=>{
  if(!isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child))return [];
  if(child.type===Fragment)return optionsFrom(child.props.children);
  if(child.type!=='option')return [];
  return [{value:String(child.props.value??child.props.children??''),label:child.props.children,disabled:child.props.disabled}];
 });
}

// Existing option declarations are consumed as data; no select or option
// elements are rendered. Keep each original value and change handler intact.
export function VisibleChoices({id,label,value,disabled=false,onChange,children}:{id?:string;label:string;value?:string;disabled?:boolean;onChange:(event:{target:{value:string}})=>void;children:ReactNode}){
 const name=useId();
 return <fieldset id={id} className="visible-choices" disabled={disabled}><legend>{label}</legend><div className="visible-choice-options">{optionsFrom(children).map(option=><label key={option.value} className={'visible-choice '+(value===option.value?'is-selected':'')}><input type="radio" name={name} value={option.value} checked={value===option.value} disabled={option.disabled} onChange={()=>onChange({target:{value:option.value}})}/><span>{option.label}</span></label>)}</div></fieldset>;
}
