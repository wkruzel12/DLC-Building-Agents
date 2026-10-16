// Optional paid smoke test: node --conditions=react-server tests/pdf-live.cjs
const fs=require('node:fs');
const assert=require('node:assert/strict');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const match=line.match(/^(OPENAI_API_KEY|OPENAI_MODEL)=(.*)$/);if(match)process.env[match[1]]=match[2];}
const {caseFromPdf}=require('../src/lib/pdf-case.ts');
const {publicScenario}=require('../src/lib/scenario.ts');
const {decisionParts}=require('../src/lib/decisions.ts');
const lines=['Case ID: pdf-import-smoke','Title: Supplier evidence review','Context: A team is evaluating a fictional supplier application.','Objective: Evaluate one record against the required certification.','Evaluation criteria: Advance certified suppliers, reject unqualified suppliers,','and human_review if certification is not clear.','Allowed decisions: advance, reject, human_review.','Record ID: s01. Label: Fictional Supplier A.','Record text: Supplier A holds the required current certification.','Explicit instructor answer key:','s01: advance. Planted: false. Note: Certification is explicitly documented.'];
function pdf(lines){
const stream='BT /F1 11 Tf 50 740 Td 16 TL '+lines.map(text=>'('+text.replace(/[()\\]/g,'\\$&')+') Tj T*').join('\n')+' ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'];
let document='%PDF-1.4\n';const offsets=[0];
objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(document));document+=(index+1)+' 0 obj\n'+object+'\nendobj\n';});
const start=Buffer.byteLength(document);document+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
return Buffer.from(document);
}
async function main(){
 const flexible=['Supplier evidence review','Situation: A team is evaluating a fictional supplier application.',
  'Your assignment: Evaluate each supplier against the certification rule.',
  'Rules: Advance certified suppliers; reject unqualified suppliers;',
  'use human_review when certification is unclear.',
  'Submission s01 - Fictional Supplier A: Current certification documented.',
  'Instructor annotation for s01: Expected outcome = proceed (advance).',
  'Private rationale: Certification is explicitly documented. Not a planted case.'];
 for(const content of [lines,flexible]){
  const value=await caseFromPdf(pdf(content));
  assert.equal(value.items.length,1);assert.equal(value.answer_key.length,1);
  assert.equal(decisionParts(value.answer_key[0].decision).type,'advance');assert.equal(value.answer_key[0].planted,false);
  assert.match(value.items[0].text,/certification/i);
  const visible=JSON.stringify(publicScenario(value));
  assert.equal(publicScenario(value).answer_key,undefined);
  assert.ok(!visible.includes('Expected outcome'));
  assert.ok(!visible.includes('Certification is explicitly documented.'));
 }
 const incomplete=flexible.slice(0,-2);
 await assert.rejects(caseFromPdf(pdf(incomplete)),error=>error.code==='grading_setup_required');
 console.log('Live PDF regression checks passed: conventional headings, alternate headings with embedded explicit grades, private annotations redacted, and missing grades rejected without invention.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
