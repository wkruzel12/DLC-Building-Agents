import type {PublicScenario} from './types';

export type MaterialKind='context'|'objective'|'requirements'|'record';
export type CaseMaterial={id:string;title:string;kind:MaterialKind;recordId?:string;text:string};
export const materialLabels:Record<MaterialKind,string>={context:'Case context',objective:'Your objective',requirements:'Business requirements',record:'Case record'};
// Build only from explicitly public fields. Never enumerate arbitrary uploaded metadata.
export function caseMaterials(scenario:PublicScenario):CaseMaterial[]{
 const sections:CaseMaterial[]=[{id:'section:context',title:'Business context',kind:'context',text:scenario.story||''},{id:'section:objective',title:'Your assignment',kind:'objective',text:scenario.task||''},{id:'section:requirements',title:'Business requirements',kind:'requirements',text:scenario.requirements||''}];
 return [...sections.filter(item=>item.text.trim()),...(scenario.items||[]).map((item,index)=>({id:'record:'+index,title:item.label||item.id,kind:'record' as const,recordId:item.id,text:item.text||''}))];
}
export function filterMaterials(materials:CaseMaterial[],query:string,kind:string='all'){
 const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return materials.filter(item=>(kind==='all'||item.kind===kind)&&terms.every(term=>[item.title,item.recordId||'',item.text].join('\n').toLocaleLowerCase().includes(term)));
}
// An excerpt, not an AI-generated summary. The full original stays available.
export function caseExcerpt(text:string,maxCharacters=660,maxSentences=4){
 const source=text.trim();if(!source)return {text:'',shortened:false};
 const sentences=Array.from(new Intl.Segmenter('en',{granularity:'sentence'}).segment(source));
 let end=0;for(const sentence of sentences.slice(0,maxSentences)){const next=sentence.index+sentence.segment.length;if(next>maxCharacters)break;end=next;}
 if(!end){end=Math.min(source.length,maxCharacters);const space=source.lastIndexOf(' ',end);if(space>maxCharacters/2)end=space;}
 const excerpt=source.slice(0,end).trimEnd();return {text:excerpt,shortened:excerpt.length<source.length};
}
