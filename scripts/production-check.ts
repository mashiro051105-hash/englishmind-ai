import { createServer } from 'node:https';
import { readFileSync,mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import { createApp } from '../server/app.js';
mkdirSync('.artifacts',{recursive:true,mode:0o700});
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-keyout','.artifacts/test-key.pem','-out','.artifacts/test-cert.pem'],{stdio:'ignore'});
const options={production:true,publicOrigin:'https://localhost',sessionSecret:randomBytes(32).toString('hex'),paidEnabled:false};
const server=createServer({key:readFileSync('.artifacts/test-key.pem'),cert:readFileSync('.artifacts/test-cert.pem')},createApp('mock',undefined,undefined,options)).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));options.publicOrigin=`https://127.0.0.1:${(server.address() as AddressInfo).port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(options.publicOrigin);await page.getByRole('button',{name:'开始本轮训练 →'}).click();await page.getByLabel('请用英语独立回答').fill('I really enjoy hiking.');await page.getByRole('button',{name:'提交并查看反馈 ↗'}).click();await page.getByText('没有明显问题',{exact:true}).waitFor();await page.getByRole('button',{name:'结束本轮',exact:true}).click();await page.reload();await page.getByRole('button',{name:'学习档案',exact:true}).click();assert.equal(await page.locator('.record-list article').count(),1);const cookies=await context.cookies();const cookie=cookies.find(c=>c.name==='englishmind_browser')!;assert.ok(cookie.secure&&cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.deepEqual(errors,[]);console.log('PASS local production HTTPS: built page/API, Secure/HttpOnly cookies, CSP, refresh and local archive (not a public deployment)');}
finally{await browser.close();await new Promise<void>(r=>server.close(()=>r()));}
