const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {caseBriefing,briefingCriteria}=require('../src/lib/case-briefing.ts');
const {caseMaterials}=require('../src/lib/case-materials.ts');
const {publicScenario,loadScenario}=require('../src/lib/scenario.ts');

test('sample briefing preserves complete original context/objective and every requirement in order',()=>{
 const sample=publicScenario(loadScenario('resume-screener')),before=JSON.stringify(sample),brief=caseBriefing(sample);
 assert.equal(brief.context,sample.story);assert.equal(brief.objective,sample.task);
 assert.equal(brief.criteria.join(' '),sample.requirements);
 for(const record of sample.items){assert.ok(!JSON.stringify(brief).includes(record.label));assert.ok(!JSON.stringify(brief).includes(record.id));}
 assert.equal(JSON.stringify(sample),before);
});

test('combined uploaded document shows only original introductory sections while all ten records remain exact in materials',()=>{
 const context='An HR team needs consistent decisions.\n\nKeep this complete original paragraph (including "quoted evidence").',objective='Design and test a responsible screening workflow.\nPreserve human oversight.',criteria=['Degree or equivalent experience (not assumed).\n  Include the documented alternative.','SQL and Excel skills; retain both requirements.','Communication evidence.'];
 const items=Array.from({length:10},(_,i)=>({id:`A-${String(i+1).padStart(2,'0')}`,label:`Applicant ${i+1}`,text:`Applicant ${i+1}\nEducation: original degree ${i+1}.\nExperience: ${i+1} years.\nSkills: SQL, Excel.\nProjects: "Evidence ${i+1}" (source).`}));
 const s={...publicScenario(loadScenario('resume-screener')),items,story:`# Context\n${context}\n\n## Objective\n${objective}\n\n## Evaluation Criteria\n${criteria.map((text,i)=>`${i+1}. ${text}`).join('\n')}\n\n## Records\n${items.map(item=>`${item.id}: ${item.label}\n${item.text}`).join('\n\n')}`,answer_key:[{note:'PRIVATE_GRADING_SENTINEL'}]},before=JSON.stringify(s);
 const brief=caseBriefing(s);assert.equal(brief.context,context);assert.equal(brief.objective,objective);assert.deepEqual(brief.criteria,criteria);
 assert.ok(!JSON.stringify(brief).includes('A-01'));assert.ok(!JSON.stringify(brief).includes('Applicant'));assert.ok(!JSON.stringify(brief).includes('PRIVATE_GRADING_SENTINEL'));
 const records=caseMaterials(s).filter(item=>item.kind==='record');assert.equal(records.length,10);
 for(const [index,item]of records.entries()){assert.equal(item.text,items[index].text);assert.equal(item.recordId,items[index].id);assert.equal(item.title,items[index].label);}
 assert.equal(JSON.stringify(s),before);
});

test('inline and numbered headings, CRLF, numbered continuations, and punctuation are retained',()=>{
 const s={...publicScenario(loadScenario('resume-screener')),story:'1. Context: A complete context (unaltered).\r\n\r\n2. Objective: The exact objective.\r\n\r\n3. Evaluation Criteria\r\n1) Keep "quoted" evidence.\r\n   - Preserve this subcriterion.\r\n2) Do not guess.\r\n4. Applicant Records\r\nr01: Priya S.\r\nResume details.'};
 assert.deepEqual(caseBriefing(s),{context:'A complete context (unaltered).',objective:'The exact objective.',criteria:['Keep "quoted" evidence.\n   - Preserve this subcriterion.','Do not guess.']});
 assert.deepEqual(briefingCriteria('First requirement; second requirement; final requirement.'),['First requirement;','second requirement;','final requirement.']);
});

test('unheaded context stops at record headings or repeated record content without truncating narrative paragraphs',()=>{
 const s=publicScenario(loadScenario('resume-screener'));
 for(const tail of [`\n\nRecords\n${s.items[0].text}`,`\n\n${s.items[0].id}: ${s.items[0].label}\n${s.items[0].text}`,`\n\n${s.items[0].text}`])assert.equal(caseBriefing({...s,story:s.story+tail}).context,s.story);
 const long='Preserve this context sentence. '.repeat(100);assert.equal(caseBriefing({...s,story:long}).context,long.trim());
});

test('non-hiring cases and missing sections do not invent facts, decisions, or requirements',()=>{
 const s={...publicScenario(loadScenario('resume-screener')),story:'Inventory requests need review.',task:'Compare documented demand.',requirements:'- Verify quantity.\n- Preserve source references.',items:[{id:'WEST-40',label:'West request',text:'Quantity: 40 (original).'}]};
 assert.deepEqual(caseBriefing(s),{context:s.story,objective:s.task,criteria:['Verify quantity.','Preserve source references.']});
 assert.deepEqual(caseBriefing({...s,story:'Records\nWEST-40\nQuantity: 40 (original).',task:'',requirements:''}),{context:'',objective:'',criteria:[]});
});

test('bold section headings and counted or named record headings keep applicant identifiers out of the introduction',()=>{
 const sample=publicScenario(loadScenario('resume-screener'));
 for(const recordHeading of ['Records (5 applicants)','Applicant 1 — Priya S. (r01)','r01: Priya S. (original resume)']){
  const s={...sample,story:`**1. Context**\nOriginal context.\n**2. Objective:** Original objective.\n**3. Evaluation Criteria**\n1. Original criterion.\n${recordHeading}\n${sample.items[0].text}`};
  assert.deepEqual(caseBriefing(s),{context:'Original context.',objective:'Original objective.',criteria:['Original criterion.']});
 }
});

test('scenario introduction excludes grading definitions and rejection notes without changing source rules',()=>{
 const sample=publicScenario(loadScenario('resume-screener'));
 const appendix='\n\nGrading decisions (definitions)\n- Advance: strong experience.\n- Human review: evidence needs confirmation.\n- Reject: a basic requirement failed.\n- Merge: duplicate record.\n\nNotes for rejected applicants\nRejections are logged for human oversight.';
 const s={...sample,story:'Context\nOriginal context.\n\nObjective\nOriginal objective.\n\nEvaluation Criteria\n1. Preserve the first criterion.\n2. Preserve the second criterion.'+appendix},before=JSON.stringify(s);
 assert.deepEqual(caseBriefing(s),{context:'Original context.',objective:'Original objective.',criteria:['Preserve the first criterion.','Preserve the second criterion.']});
 assert.equal(JSON.stringify(s),before);
 assert.ok(caseMaterials(s).some(material=>material.text.includes('Grading decisions (definitions)')));
 for(const heading of ['Grading decisions (definitions)','Notes for rejected applicants']){
  const tail='\n\n## '+heading+'\nSupplementary decision guidance.';
  const projected=caseBriefing({...sample,story:sample.story+tail,task:sample.task+tail,requirements:sample.requirements+tail});
  assert.equal(projected.context,sample.story);assert.equal(projected.objective,sample.task);assert.equal(projected.criteria.join(' '),sample.requirements);
 }
});
