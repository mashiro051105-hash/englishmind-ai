// Export the committed, tracked source only. No remote operation, network or API call.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024});
if(git('status','--porcelain').toString().trim())throw Error('请先检查并提交本地修改，确保 ZIP 与 Git 检查点一致。');
const files=git('ls-files','-z').toString().split('\0').filter(Boolean);
for(const name of files){
 const base=name.split('/').at(-1);
 if(/(^|\/)(node_modules|dist|exports|\.artifacts|quality-results|\.git)(\/|$)/.test(name)||/\.(log|pem|key|p12|zip)$/i.test(name)||(base.startsWith('.env')&&!/^\.env(?:\.[\w-]+)?\.example$/.test(base)))throw Error('归档拒绝敏感或运行文件：'+name);
 if(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/.test(readFileSync(name,'utf8')))throw Error('归档拒绝疑似密钥：'+name);
}
const version=JSON.parse(readFileSync('package.json','utf8')).version;
const commit=git('rev-parse','HEAD').toString().trim();
const zip=git('archive','--format=zip','--prefix=englishmind-ai/','HEAD');
mkdirSync('exports',{recursive:true});
const path=`exports/englishmind-ai-v${version}.zip`;
writeFileSync(path,zip);
const sha256=createHash('sha256').update(zip).digest('hex');
writeFileSync(path+'.sha256',sha256+'  '+path.split('/').at(-1)+'\n');
writeFileSync(path+'.manifest.json',JSON.stringify({version,commit,sha256,sourceFiles:files.length,containsGitHistory:false,onlineCalls:0},null,2)+'\n');
console.log(JSON.stringify({path,version,commit,sha256,sourceFiles:files.length}));
