// Presentation only: never changes a saved response, decision, or grading input.
export type OutputValue=
 | {kind:'text';text:string}
 | {kind:'number';text:string}
 | {kind:'boolean';value:boolean}
 | {kind:'null'}
 | {kind:'object';fields:{key:string;value:OutputValue}[]}
 | {kind:'array';items:OutputValue[]};
export type PresentedOutput={kind:'empty';original:string}|{kind:'text';text:string;original:string;unstructured:boolean}|{kind:'structured';value:OutputValue;original:string};

// JSON.parse validates syntax, but its numeric conversions must not change
// evidence such as large IDs, decimals, exponents, or negative zero on screen.
function readJson(source:string):OutputValue{
 JSON.parse(source);
 let position=0,nodes=0;
 function space(){while(/\s/.test(source[position]||'')&&position<source.length)position++;}
 function string(){
  const start=position++;
  while(position<source.length){const char=source[position++];if(char==='\\')position++;else if(char==='"')return JSON.parse(source.slice(start,position)) as string;}
  throw Error('Incomplete string');
 }
 function value(depth:number):OutputValue{
  if(depth>24||++nodes>2000)throw Error('Display as original text');
  space();const char=source[position];
  if(char==='"')return {kind:'text',text:string()};
  if(char==='{'){
   position++;space();const fields:{key:string;value:OutputValue}[]=[];
   if(source[position]==='}'){position++;return {kind:'object',fields};}
   while(position<source.length){space();const key=string();space();position++;fields.push({key,value:value(depth+1)});space();if(source[position++]==='}')return {kind:'object',fields};}
  }
  if(char==='['){
   position++;space();const items:OutputValue[]=[];
   if(source[position]===']'){position++;return {kind:'array',items};}
   while(position<source.length){items.push(value(depth+1));space();if(source[position++]===']')return {kind:'array',items};}
  }
  for(const [token,result] of [['true',{kind:'boolean',value:true}],['false',{kind:'boolean',value:false}],['null',{kind:'null'}]] as const){if(source.startsWith(token,position)){position+=token.length;return result;}}
  const number=source.slice(position).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if(number){position+=number[0].length;return {kind:'number',text:number[0]};}
  throw Error('Unexpected value');
 }
 const result=value(0);space();if(position!==source.length)throw Error('Extra content');return result;
}

export function presentOutput(input:string|null|undefined):PresentedOutput{
 const original=input??'';
 if(!original.trim())return {kind:'empty',original};
 const trimmed=original.trim();
 // Only unwrap a complete JSON code fence, never partial JSON or prose.
 const fence=trimmed.match(/^```(json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
 const source=fence?fence[2].trim():trimmed;
 // An unmarked quoted sentence may be a meaningful quotation, not a JSON
 // string wrapper. Only objects/arrays or explicitly fenced JSON are decoded.
 if(source.length<=100000&&(source[0]==='{'||source[0]==='['||Boolean(fence?.[1]))){
  try{return {kind:'structured',value:readJson(source),original};}catch{/* Preserve the entire response rather than repairing it by guessing. */}
 }
 return {kind:'text',text:original,original,unstructured:source.startsWith('{')||source.startsWith('[')||/^```json\b/i.test(trimmed)};
}

const labels:Record<string,string>={id:'ID',item_id:'Record ID',record_id:'Record ID',target_record_id:'Target record ID',requires_target:'Requires a target',candidate_experience:'Candidate experience',supporting_evidence:'Supporting evidence',key_findings:'Key findings'};
export function outputLabel(key:string){
 if(Object.hasOwn(labels,key))return labels[key];
 const label=key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ').trim();
 return label?label[0].toUpperCase()+label.slice(1):key||'Unnamed field';
}

export type TextBlock={kind:'paragraph'|'heading'|'code';text:string}|{kind:'list';items:{marker:string;text:string;indent:number}[]};
export function outputTextBlocks(text:string):TextBlock[]{
 const lines=text.split(/\r\n|\n|\r/),blocks:TextBlock[]=[];
 let paragraph:string[]=[],list:{marker:string;text:string;indent:number}[]=[];
 function flush(){
  if(paragraph.length){
   const content=paragraph.join('\n');
   if(paragraph.length===1&&content.length>700&&typeof Intl.Segmenter==='function'){
    let group='';
    for(const sentence of new Intl.Segmenter('en',{granularity:'sentence'}).segment(content)){
     if(group&&group.length+sentence.segment.length>600){blocks.push({kind:'paragraph',text:group});group='';}
     group+=sentence.segment;
    }
    if(group)blocks.push({kind:'paragraph',text:group});
   }else blocks.push({kind:'paragraph',text:content});
   paragraph=[];
  }
  if(list.length){blocks.push({kind:'list',items:list});list=[];}
 }
 for(let index=0;index<lines.length;index++){
  const line=lines[index];
  if(!line.trim()){flush();continue;}
  if(/^```[\w-]*\s*$/.test(line)){
   const end=lines.findIndex((value,next)=>next>index&&/^```\s*$/.test(value));
   if(end>index){flush();blocks.push({kind:'code',text:lines.slice(index+1,end).join('\n')});index=end;continue;}
  }
  const heading=line.match(/^#{1,6}\s+(.+)$/),item=line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
  if(heading){flush();blocks.push({kind:'heading',text:heading[1]});}
  else if(item){if(paragraph.length)flush();list.push({marker:item[2],text:item[3],indent:item[1].length});}
  else{if(list.length)flush();paragraph.push(line);}
 }
 flush();return blocks;
}
