const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {sampleReference,readableEvidence,recordEvidence}=require('../src/lib/record-review.ts');
const sample=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));
test('all five original sample records have explicit evidence and a teaching goal',()=>{
 for(const row of sample.items){const review=sampleReference(sample,sample.items,row.id);assert.ok(review);assert.ok(review.evidence.length>=3);assert.ok(review.goal);assert.ok(!Object.hasOwn(review,'answer_key'));assert.ok(!Object.hasOwn(review,'planted'));}
 assert.match(sampleReference(sample,sample.items,'r02').connection,/equivalent/);
 assert.match(sampleReference(sample,sample.items,'r04').goal,/human review/);
});
test('sample teaching goals are never assigned to uploaded or changed records, requirements, or tasks',()=>{
 for(const s of [{...sample,id:'uploaded'},{...sample,requirements:'Different rules'},{...sample,task:'Different assignment'},{...sample,items:sample.items.slice(0,4)},{...sample,items:sample.items.map(r=>r.id==='r02'?{...r,text:'Different applicant'}:r)}])assert.equal(sampleReference(s,s.items,'r02'),null);
 assert.equal(sampleReference(sample,sample.items.map(r=>r.id==='r02'?{...r,text:'Older record'}:r),'r02'),null);
 assert.equal(sampleReference(undefined,sample.items,'r02'),null);assert.equal(sampleReference(sample,sample.items,'unknown'),null);
});
test('recorded AI evidence retains exact facts while structured wrappers become readable labels',()=>{
 const raw=JSON.stringify({education:'No degree',years:3,sql:false,missing:null,evidence:['Power Query','Client presentations']});
 const lines=readableEvidence(raw);assert.ok(lines.includes('Education: No degree'));assert.ok(lines.includes('Years: 3'));assert.ok(lines.includes('Sql: false')||lines.includes('SQL: false'));assert.ok(lines.some(line=>line.includes('Not provided')));assert.ok(lines.some(line=>line.includes('Power Query')));assert.ok(!lines.join('').includes('{'));
 assert.deepEqual(readableEvidence(undefined),[]);assert.deepEqual(readableEvidence(''),[]);
});
test('simulation evidence is marked as source reuse rather than fabricated AI findings',()=>{
 const row={item_id:'r02',outputs:{extract:'Demo extraction for Jordan M.: Original resume.',check:'',flag:''}};
 assert.deepEqual(recordEvidence({mode:'demo',records:[{id:'r02',text:'Full source resume.'}]},row),{simulated:true,lines:['Full source resume.']});
 assert.deepEqual(recordEvidence({mode:'demo'},row),{simulated:true,lines:['Original resume.']});
 assert.deepEqual(recordEvidence({mode:'openai'},row),{simulated:false,lines:['Demo extraction for Jordan M.: Original resume.']});
});
test('clean record comparisons render saved instructions, evidence, reference, goal and escaped text without code',()=>{
 const {execFileSync}=require('node:child_process');
 const script=String.raw`
 const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path'),resolve=Module._resolveFilename;
 Module._resolveFilename=function(request,...args){return resolve.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,...args)};
 for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{RecordReview}=require('./src/components/lab/RecordReview.tsx');
 const scenario=JSON.parse(fs.readFileSync('scenarios/resume-screener.json','utf8'));
 const result={item_id:'r02',label:'Jordan M.',match:false,decision:'reject',reason:'No degree.',outputs:{extract:JSON.stringify({evidence:'Recorded <script> evidence',years:3}),check:'',flag:''}};
 const attempt={mode:'openai',records:scenario.items,steps:{extract:'Exact original instruction.',check:'Check only case evidence.',flag:'Use permitted actions.'}};
 const markup=renderToStaticMarkup(React.createElement(RecordReview,{scenario,result,attempt}));
 for(const label of ['What you told your agent to do','What your agent pulled','What it should have pulled','What we’re going for','Exact original instruction.','Recorded &lt;script&gt; evidence','Advance for this sample case.'])assert.ok(markup.includes(label),label);
 assert.ok(!markup.includes('<pre'));assert.ok(!markup.includes('<code'));assert.ok(!markup.includes('<script>'));assert.ok(!markup.includes('answer_key'));
 const unknown=renderToStaticMarkup(React.createElement(RecordReview,{scenario:{...scenario,id:'custom'},result,attempt}));assert.ok(unknown.includes('reference has not been supplied'));assert.ok(!unknown.includes('Advance for this sample case.'));
 const demo=renderToStaticMarkup(React.createElement(RecordReview,{scenario,result,attempt:{...attempt,mode:'demo'}}));assert.ok(demo.includes('No AI extraction was generated'));assert.ok(!demo.includes('Recorded &lt;script&gt; evidence'));
 console.log('Clean review renderer passed');`;
 assert.match(execFileSync(process.execPath,['-'],{input:script,encoding:'utf8'}),/Clean review renderer passed/);
});
