'use client';
import {Children,isValidElement,type ReactNode} from 'react';

// Keep every option in view instead of hiding choices inside a dropdown.
export function VisibleChoices({id,value,disabled,onChange,children}:{id?:string;value?:string;disabled?:boolean;onChange:(event:{target:{value:string}})=>void;children:ReactNode}){
 return <div id={id} className="visible-choices" role="group" aria-label="Available choices">{Children.toArray(children).map((child,index)=>{
  if(!isValidElement<{value?:string;children?:ReactNode}>(child))return null;
  const choice=String(child.props.value??'');
  return <button type="button" key={choice+index} disabled={disabled} aria-pressed={value===choice} onClick={()=>onChange({target:{value:choice}})}>{child.props.children}</button>;
 })}</div>;
}
