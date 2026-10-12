import { execFileSync } from 'node:child_process';
import { readFileSync,existsSync } from 'node:fs';
const files=execFileSync('git',['ls-files','-co','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);let issues=0;
for(const file of files){if(/(^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.example')){console.log('BLOCK sensitive tracked path: '+file);issues++;continue;}if(!existsSync(file))continue;const text=readFileSync(file,'utf8');if(file.endsWith('.example')&&/^(?:OPENAI_API_KEY|SESSION_COOKIE_SECRET|AI_ACCESS_CODE)=[ \t]*\S/m.test(text)){console.log('BLOCK nonempty secret in template: '+file);issues++;}if(/sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)){console.log('BLOCK potential secret in: '+file);issues++;}}
for(const file of ['.env','node_modules','dist','.artifacts','quality-results/','access.log']){try{execFileSync('git',['check-ignore',file],{stdio:'ignore'});}catch{console.log('BLOCK ignore missing: '+file);issues++;}}
if(issues)process.exitCode=1;else console.log('PASS tracked source secret patterns and ignored sensitive/runtime paths (not a complete secret audit)');
