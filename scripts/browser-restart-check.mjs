import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port=3015,base=`http://127.0.0.1:${port}`;let server;
async function start(provider='mock'){server=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,AI_PROVIDER:provider,PORT:String(port),...(provider==='openai'?{OPENAI_API_KEY:'',OPENAI_MODEL:''}:{})},stdio:'ignore'});for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('server not ready');}
async function stop(){if(server&&!server.killed){const ended=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');await ended;}}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 await start();const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(base);await page.getByRole('button',{name:'开始本轮训练 →'}).click();await page.getByLabel('请用英语独立回答').fill('I very like English.');await page.getByRole('button',{name:'提交并查看反馈 ↗'}).click();await page.getByText('语法错误',{exact:true}).waitFor();
 const oldId=await page.evaluate(()=>JSON.parse(localStorage.getItem('englishmind.session.v2')).id);await page.reload();await page.getByText('语法错误',{exact:true}).waitFor();await stop();await start();assert.equal((await fetch(base+`/api/training/${oldId}`)).status,404);
 await page.reload();await page.getByText(/训练会话已失效/).waitFor();await page.getByRole('button',{name:'学习档案',exact:true}).click();assert.equal(await page.locator('.record-list article').count(),1);const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('englishmind.practice.v2')));assert.equal(records.length,1);assert.deepEqual(records[0].transferResults,[]);
 console.log('PASS real Chromium refresh and actual server restart: session gone, local archive preserved, no fabricated success');
 // Corrupt local archive remains untouched; UI reports the problem.
 await page.evaluate(()=>{localStorage.setItem('englishmind.practice.v2','{bad');localStorage.removeItem('englishmind.session.v2');});await page.reload();await page.getByText(/本地存储不可用或记录格式不兼容/).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('englishmind.practice.v2')),'{bad');console.log('PASS browser malformed localStorage preserved with visible warning');
 await page.evaluate(()=>localStorage.clear());await stop();await start('openai');await page.reload();await page.getByText('独立AI配置未就绪；不会回退Mock。',{exact:true}).waitFor();await page.getByRole('button',{name:'开始本轮训练 →'}).click();await page.getByRole('alert').filter({hasText:/OPENAI_API_KEY/}).waitFor();const health=await(await fetch(base+'/api/health')).json();assert.equal(health.provider,'openai');assert.equal(health.ready,false);console.log('PASS browser openai-without-credentials shows not-ready and 503, never silently uses Mock');
}finally{await stop();await browser.close();}
