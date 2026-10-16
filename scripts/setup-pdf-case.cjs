// Instructor/operator tool only. Never imported by Next.js or exposed through an API.
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {extractPdfCase}=require('../src/lib/pdf-case.ts');
const {validatePdfCase}=require('../src/lib/pdf-case-validation.ts');
const {MAX_CASE_BYTES}=require('../src/lib/case-schema.ts');

async function main(){
 const [command,source,destination]=process.argv.slice(2);
 if(!source||!['extract','validate'].includes(command)||(command==='extract'&&!destination))throw Error('Usage: npm run case:setup -- extract case.pdf .private-cases/draft.json OR npm run case:setup -- validate .private-cases/draft.json');
 if(fs.statSync(source).size>MAX_CASE_BYTES)throw Error('Case files must be 1 MB or smaller.');
 if(command==='validate'){
  validatePdfCase(JSON.parse(fs.readFileSync(source,'utf8')));
  console.log('Case validated. Upload this private JSON through the existing case upload. Grading answers remain server-side.');return;
 }
 // Next is not running here, so explicitly load only the server OpenAI settings.
 if(fs.existsSync('.env.local'))for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){
  const match=line.match(/^\s*(OPENAI_API_KEY|OPENAI_MODEL)\s*=\s*(.*?)\s*$/);
  if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
 }
 const root=path.resolve('.private-cases'),target=path.resolve(destination);
 if(path.dirname(target)!==root||path.extname(target)!=='.json')throw Error('Write drafts directly under .private-cases/ as a .json file. This private directory is excluded from Git.');
 const draft=await extractPdfCase(fs.readFileSync(source));
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 fs.writeFileSync(target,JSON.stringify(draft,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('Private draft saved. Review ALL extracted content against the PDF, remove grading annotations from public fields, and supply/correct answer_key entries using authoritative instructor decisions. No answers have been assigned for missing grades.');
 try{validatePdfCase(draft);console.log('Draft passes schema validation; instructor review is still required.');}catch(error){console.log(error.message);for(const issue of error.issues||[])console.log(issue);}
}
if(require.main===module)main().catch(error=>{console.error(error instanceof SyntaxError?'Invalid JSON. Correct the private setup file and validate again.':error.message);process.exitCode=1;});
