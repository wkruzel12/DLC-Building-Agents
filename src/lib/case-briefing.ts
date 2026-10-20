import type {PublicScenario} from './types';

type Section='context'|'objective'|'criteria'|'materials';
const headings:Record<string,Section>={
 context:'context','business context':'context','scenario context':'context',
 objective:'objective',objectives:'objective',task:'objective','your objective':'objective',
 'evaluation criteria':'criteria','business requirements':'criteria',requirements:'criteria',criteria:'criteria',
 records:'materials','applicant records':'materials','candidate records':'materials',applicants:'materials',candidates:'materials',resumes:'materials',
 'allowed decision types':'materials','allowed actions':'materials','decision rules':'materials','private grading key':'materials','grading key':'materials','answer key':'materials',stakeholders:'materials',
};

// Read only public text. This is a display projection, never a case/schema repair.
function sourceSections(text:string,items:PublicScenario['items']){
 const boundaries:{kind:Section;start:number;body:number}[]=[];
 for(const match of text.matchAll(/^.*$/gm)){
  const line=match[0].replace(/\r$/,'');
  const plain=line.trim().replace(/\*\*/g,'').replace(/^#{1,6}\s+/,'').replace(/^(?:\d+|[A-Z])[.)]\s+/,'');
  const heading=plain.match(/^([^:]+?)(?:\s*:\s*(.*))?$/);
  const name=heading?.[1].trim().toLowerCase();
  const kind=name&&Object.hasOwn(headings,name)?headings[name]:name&&/^(?:records|applicant records|candidate records)\s*\(\d+(?:\s+(?:applicants|candidates|records))?\)$/.test(name)?'materials':undefined;
  if(kind){
   // For inline headings, retain the original body, punctuation, and line breaks.
   const colon=line.indexOf(':');
   const inline=colon>=0&&Boolean(heading?.[2]);
   let body=inline?match.index!+colon+1:match.index!+match[0].length;
   if(inline&&text.slice(body).startsWith('**'))body+=2;
   boundaries.push({kind,start:match.index!,body});
  }else{
   const label=plain.replace(/[:\s]+$/,'');
   const namedRecord=/^(?:applicant|candidate|record)\s+/i.test(label)&&(/^(?:applicant|candidate|record)\s+#?\d+\b/i.test(label)||items.some(item=>label.includes(item.id)||label.includes(item.label)));
   const record=namedRecord||items.some(item=>label===item.id||label===item.label||label.startsWith(item.id+':')||label===`${item.id} — ${item.label}`||label===`${item.id} - ${item.label}`);
   if(record)boundaries.push({kind:'materials',start:match.index!,body:match.index!});
  }
 }
 // Some imports repeat the record's complete text without adding a heading.
 const firstRecord=items.reduce((first,item)=>{const at=item.text.trim()?text.indexOf(item.text):-1;return at>=0?Math.min(first,at):first;},text.length);
 const stop=Math.min(firstRecord,boundaries.find(boundary=>boundary.kind==='materials')?.start??text.length);
 const sections:Partial<Record<Section,string>>={};
 boundaries.forEach((boundary,index)=>{
  if(boundary.start>=stop||boundary.kind==='materials'||sections[boundary.kind]!==undefined)return;
  sections[boundary.kind]=text.slice(boundary.body,Math.min(stop,boundaries[index+1]?.start??text.length)).trim();
 });
 return {sections,prefix:text.slice(0,Math.min(stop,boundaries[0]?.start??text.length)).trim()};
}

// A numbered source item stays one item, including wrapped lines/sub-bullets.
// Unnumbered lists use their source bullets. Prose splits only at explicit
// semicolons/newlines, keeping punctuation rather than rewriting sentences.
export function briefingCriteria(text:string):string[]{
 const lines=text.split(/\r\n|\n|\r/);
 const numbered=/^\s*\d+[.)]\s+/,bullet=/^\s*[-*•]\s+/;
 const marker=lines.some(line=>numbered.test(line))?numbered:bullet;
 if(lines.some(line=>marker.test(line))){
  const items:string[]=[];let current:string[]=[];
  const flush=()=>{if(current.some(line=>line.trim()))items.push(current.join('\n').trim());current=[];};
  for(const line of lines){if(marker.test(line)){flush();current.push(line.replace(marker,''));}else current.push(line);}
  flush();return items;
 }
 return text.split(/(?<=;)\s+|\r?\n\s*\r?\n/).map(item=>item.trim()).filter(Boolean);
}

export function caseBriefing(scenario:PublicScenario){
 const story=sourceSections(scenario.story,scenario.items),task=sourceSections(scenario.task,scenario.items),requirements=sourceSections(scenario.requirements,scenario.items);
 return {
  context:story.sections.context??story.prefix,
  objective:story.sections.objective??task.sections.objective??task.prefix,
  criteria:briefingCriteria(story.sections.criteria??requirements.sections.criteria??requirements.prefix),
 };
}
