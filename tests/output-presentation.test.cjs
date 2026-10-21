const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {presentOutput,outputLabel,outputTextBlocks}=require('../src/lib/output-presentation.ts');

test('structured fields decode JSON escapes once and preserve quotes, parentheses, paths, and multiline citations',()=>{
 const evidence='Said "three years (part time)".\nSource: A-02, p. 3 [1].\nC:\\new\\notes.txt';
 const original=JSON.stringify({candidate_experience:'3 years',supporting_evidence:evidence,status:'Uncertain (verification required)',target_record_id:'A-02'});
 const result=presentOutput(original);
 assert.equal(result.kind,'structured');assert.equal(result.original,original);
 assert.deepEqual(result.value.fields.map(field=>[field.key,field.value.text]),[['candidate_experience','3 years'],['supporting_evidence',evidence],['status','Uncertain (verification required)'],['target_record_id','A-02']]);
 assert.equal(outputLabel('candidate_experience'),'Candidate experience');assert.equal(outputLabel('target_record_id'),'Target record ID');assert.equal(outputLabel('supportingEvidence'),'Supporting Evidence');
 assert.equal(outputLabel('A-02'),'A-02');assert.equal(outputLabel('Evidence (p. 3)'),'Evidence (p. 3)');
});

test('numbers remain exact lexemes rather than rounded JavaScript conversions',()=>{
 const original='{"large_id":9007199254740993,"precision":0.12345678901234567890,"exponent":1e+400,"zero":-0}';
 const result=presentOutput(original);
 assert.equal(result.kind,'structured');assert.deepEqual(result.value.fields.map(field=>field.value.text),['9007199254740993','0.12345678901234567890','1e+400','-0']);assert.equal(result.original,original);
});

test('explicit null, empty text, false, zero, and absent information remain distinct',()=>{
 const result=presentOutput('{"unknown":null,"empty":"","confirmed":false,"count":0,"findings":[],"details":{}}');
 assert.deepEqual(result.value.fields.map(field=>field.value.kind),['null','text','boolean','number','array','object']);
 assert.equal(result.value.fields[2].value.value,false);assert.equal(result.value.fields[3].value.text,'0');assert.equal(result.value.fields.some(field=>field.key==='invented'),false);
 for(const value of [null,undefined,'',' \n\t'])assert.equal(presentOutput(value).kind,'empty');
});

test('malformed or partial JSON is displayed intact, never repaired or treated as a success',()=>{
 for(const original of ['{"status":"uncertain",','{"evidence":"line\ninvalid"}','```json\n{"missing":}\n```','{"value":NaN}','["quoted (source)",]']){
  const result=presentOutput(original);assert.equal(result.kind,'text');assert.equal(result.text,original);assert.equal(result.original,original);assert.equal(result.unstructured,true);
 }
});

test('only complete JSON fences and unambiguous structures are decoded',()=>{
 assert.equal(presentOutput('```json\n{"status":"uncertain"}\n```').value.fields[0].value.text,'uncertain');
 assert.equal(presentOutput('```json\n"Line one\\nLine two"\n```').value.text,'Line one\nLine two');
 for(const original of ['"A meaningful quotation (not a JSON wrapper)."','A literal \\n in a source path must stay literal.','The source contains {"count": 3}.','```text\n{"evidence": "source"}\n```'])assert.equal(presentOutput(original).text,original);
});

test('duplicate fields and equal evidence in different fields are not silently discarded',()=>{
 const result=presentOutput('{"status":"unknown","status":"unverified","first":{"evidence":"A-02"},"second":{"evidence":"A-02"},"__proto__":{"polluted":true}}');
 assert.deepEqual(result.value.fields.map(field=>field.key),['status','status','first','second','__proto__']);assert.equal({}.polluted,undefined);
});

test('large or deeply nested responses gracefully retain all original content',()=>{
 const nested='['.repeat(30)+'"A-02 (uncertain)"'+']'.repeat(30),large='{"evidence":"'+'x'.repeat(100001)+'"}';
 for(const original of [nested,large]){assert.equal(presentOutput(original).kind,'text');assert.equal(presentOutput(original).text,original);}
});

test('free-form paragraphs, findings, and code retain meaningful punctuation and original values',()=>{
 const text='# Findings\n\n- Evidence: "A-02" (p. 3).\n- Status: uncertain.\n\nKeep 3.5 years and [1].\nIntentional line break.\n\n```text\nC:\\new\\notes.txt\n```';
 const blocks=outputTextBlocks(text);
 assert.deepEqual(blocks.map(block=>block.kind),['heading','list','paragraph','code']);
 assert.equal(blocks[1].items[0].text,'Evidence: "A-02" (p. 3).');assert.equal(blocks[2].text,'Keep 3.5 years and [1].\nIntentional line break.');assert.equal(blocks[3].text,'C:\\new\\notes.txt');
 const long='The evidence remains uncertain (record A-02, p. 3). '.repeat(24),paragraphs=outputTextBlocks(long);
 assert.ok(paragraphs.length>1);assert.equal(paragraphs.map(block=>block.text).join(''),long);
});

test('rendered outputs escape untrusted HTML, retain evidence, and present structured evidence without raw JSON',()=>{
 // React's server-component condition intentionally excludes the DOM renderer.
 // Render this client-only presentation component in an ordinary Node process.
 const {execFileSync}=require('node:child_process');
 const checks=String.raw`
 const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
 const Module=require('node:module'),path=require('node:path'),resolve=Module._resolveFilename;
 Module._resolveFilename=function(request,...args){return resolve.call(this,request.startsWith('@/')?path.resolve('src',request.slice(2)):request,...args)};
 for(const extension of ['.ts','.tsx'])require.extensions[extension]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,filename);
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const {AiOutput,DecisionOutput,OutputSection}=require('./src/components/lab/AiOutput.tsx');
 const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
 const evidence='"Quoted evidence (part time)"\nA-02, p. 3 [1]';
 const markup=render(AiOutput,{value:JSON.stringify({candidate_experience:'3 years',supporting_evidence:evidence,unknown:null,confirmed:false,empty:''}),showOriginal:true});
 assert.ok(markup.includes('Candidate experience'));assert.ok(markup.includes('3 years'));assert.ok(markup.includes('Not provided'));assert.ok(markup.includes('Empty text'));assert.ok(markup.includes('false'));assert.ok(markup.includes('part time'));assert.ok(markup.includes('A-02, p. 3 [1]'));
 assert.ok(!markup.includes('<details'));assert.ok(!markup.includes('output-original'));assert.ok(!markup.includes('candidate_experience'));
 const attack=render(AiOutput,{value:JSON.stringify({evidence:'<img src=x onerror=alert(1)>',source:'[click](javascript:alert(1))'})});
 assert.ok(!attack.includes('<img'));assert.ok(!attack.includes('<script'));assert.ok(!attack.includes('href="javascript:'));assert.ok(attack.includes('&lt;img'));
 const decision=render(DecisionOutput,{decision:{type:'merge',target_record_id:'A-02'},reason:'Same request (source "A-02").'});
 assert.ok(decision.includes('Merge into A-02'));assert.equal((decision.match(/Same request/g)||[]).length,1);
 const missing=render(AiOutput,{value:undefined});assert.ok(missing.includes('No output was recorded'));assert.ok(!missing.includes('<h'));
 const plain=render(AiOutput,{value:'"A meaningful quotation (uncertain)."'});assert.ok(plain.includes('&quot;A meaningful quotation (uncertain).&quot;'));
 const formatted=render(AiOutput,{value:'**Evidence**\nA-02 (p. 3).'});assert.ok(formatted.includes('<strong>Evidence</strong>'));assert.ok(formatted.includes('A-02 (p. 3).'));
 const feedback=render(OutputSection,{title:'Evaluation feedback',kind:'evaluation',children:'This practice test was not graded.'});assert.ok(feedback.includes('output-evaluation'));assert.ok(!feedback.includes('100%'));
 const {VisibleChoices}=require('./src/components/lab/VisibleChoices.tsx');
 const choices=renderToStaticMarkup(React.createElement(VisibleChoices,{id:'records',label:'Choose a record',value:'A-02',onChange:()=>{}},React.createElement(React.Fragment,null,React.createElement('option',{value:'A-01'},'First record'),React.createElement('option',{value:'A-02'},'Second record'))));
 assert.ok(choices.includes('<fieldset'));assert.ok(choices.includes('<legend>Choose a record</legend>'));assert.equal((choices.match(/type="radio"/g)||[]).length,2);assert.ok(choices.includes('checked=""'));assert.ok(!choices.includes('<select'));assert.ok(!choices.includes('<option'));
 console.log('Renderer checks passed');
 `;
 assert.match(execFileSync(process.execPath,['-'],{input:checks,encoding:'utf8'}),/Renderer checks passed/);
});
