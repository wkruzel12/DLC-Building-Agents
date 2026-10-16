const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {caseMaterials,caseExcerpt,filterMaterials}=require('../src/lib/case-materials.ts');
const {publicScenario,loadScenario}=require('../src/lib/scenario.ts');
test('library includes every public section and complete record without grading data or arbitrary private metadata',()=>{
 const s=loadScenario('resume-screener'),materials=caseMaterials({...publicScenario(s),answer_key:[{note:'PRIVATE_GRADING_DATA'}],attachments:[{text:'PRIVATE_ATTACHMENT'}]});
 assert.equal(materials.length,s.items.length+3);
 for(const item of s.items){const document=materials.find(value=>value.recordId===item.id);assert.equal(document.text,item.text);assert.equal(document.title,item.label);}
 assert.ok(!JSON.stringify(materials).includes('PRIVATE_'));assert.equal(materials.find(m=>m.kind==='requirements').text,s.requirements);
});
test('non-hiring documents keep original record capitalization, punctuation, content, and distinguish internal section IDs',()=>{
 const s={...publicScenario(loadScenario('resume-screener')),title:'Inventory allocation',story:'A warehouse reviews stock.',task:'Review allocation requests.',requirements:'Use documented demand.',items:[{id:'A-10',label:'Request 10',text:'Priority demand: west store.'},{id:'section:context',label:'Source context record',text:'An actual case record.'}]};
 const materials=caseMaterials(s);assert.equal(new Set(materials.map(m=>m.id)).size,5);assert.equal(materials[3].recordId,'A-10');assert.equal(materials[3].text,s.items[0].text);assert.equal(materials[4].recordId,'section:context');assert.ok(!JSON.stringify(materials).includes('applicant'));
});
test('search and type filtering use public title, original ID, and complete document text without modifying results',()=>{
 const materials=caseMaterials(publicScenario(loadScenario('resume-screener')));
 const before=JSON.stringify(materials);
 assert.equal(filterMaterials(materials,'r02','record')[0].recordId,'r02');
 assert.equal(filterMaterials(materials,'power QUERY','record')[0].recordId,'r02');
 assert.equal(filterMaterials(materials,'','requirements').length,1);
 assert.equal(filterMaterials(materials,'no such material').length,0);
 assert.equal(JSON.stringify(materials),before);
});
test('short source excerpts never invent or rewrite facts and leave full text available separately',()=>{
 const source='First sentence explains the context. Second sentence adds a fact. Third sentence gives another fact. Fourth sentence adds detail. Fifth sentence must remain available.';
 const brief=caseExcerpt(source,500,4);assert.equal(brief.shortened,true);assert.ok(source.startsWith(brief.text));assert.ok(brief.text.includes('Fourth sentence'));assert.ok(!brief.text.includes('Fifth sentence'));
 const long='A detailed statement '+('with source evidence '.repeat(200));const excerpt=caseExcerpt(long,120);assert.ok(excerpt.text.length<=120);assert.ok(long.startsWith(excerpt.text));assert.equal(excerpt.shortened,true);
 assert.deepEqual(caseExcerpt(''),{text:'',shortened:false});assert.deepEqual(caseExcerpt('One clear fact.'),{text:'One clear fact.',shortened:false});
});
