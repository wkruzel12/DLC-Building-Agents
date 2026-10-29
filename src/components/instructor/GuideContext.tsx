'use client';
import {createContext,useCallback,useContext,useMemo,useRef} from 'react';

// What Proofwork Guide should know about the page the instructor is on.
export type GuidePageContext={page:'dashboard'|'create';case_id?:string;draft?:string};
type GuideStore={get:()=>GuidePageContext;set:(value:GuidePageContext)=>void};
const Context=createContext<GuideStore|null>(null);

export function GuideProvider({children}:{children:React.ReactNode}){
 const current=useRef<GuidePageContext>({page:'dashboard'});
 const get=useCallback(()=>current.current,[]),set=useCallback((value:GuidePageContext)=>{current.current=value;},[]);
 const value=useMemo(()=>({get,set}),[get,set]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
const fallback:GuideStore={get:()=>({page:'dashboard'}),set:()=>{}};
export function useGuideContext(){return useContext(Context)||fallback;}
