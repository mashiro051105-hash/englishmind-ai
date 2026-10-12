import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const base=process.env.BROWSER_BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);await page.getByRole('button',{name:'开始本轮训练 →'}).click();
  await page.getByLabel('请用英语独立回答').fill('I want to learn more knowledge.');await page.getByRole('button',{name:'提交并查看反馈 ↗'}).click();
  await page.getByText('搭配不自然',{exact:true}).waitFor();await page.getByRole('button',{name:'针对性练习',exact:true}).click();
  await page.getByLabel('请用英语独立回答').waitFor();assert.equal(await page.getByText('自然表达建议（提交后显示）',{exact:true}).count(),0);
  await page.reload();await page.getByLabel('请用英语独立回答').waitFor();assert.match(await page.locator('.task').first().innerText(),/天文学/);
  await page.getByLabel('请用英语独立回答').fill('I want to gain knowledge about astronomy.');await page.getByRole('button',{name:'提交并查看反馈 ↗'}).click();await page.getByRole('button',{name:'进入迁移检验',exact:true}).click();
  await page.getByLabel('请用英语独立回答').fill('I would like to acquire more knowledge about cooking.');await page.getByRole('button',{name:'提交并查看反馈 ↗'}).click();await page.getByText('首次独立成功（仅本题）',{exact:true}).waitFor();
  await page.getByRole('button',{name:'结束本轮',exact:true}).click();await page.getByRole('button',{name:'学习档案',exact:true}).click();await page.getByText('迁移 1：首次独立成功（仅本题）',{exact:true}).waitFor();
  const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('englishmind.practice.v2')));assert.equal(persisted.length,1);assert.equal(persisted[0].attempts.length,3);
  await page.reload();await page.getByRole('button',{name:'学习档案',exact:true}).click();assert.equal(await page.locator('.record-list article').count(),1);
  async function prepareTransfer(){
   await page.getByRole('button',{name:'表达诊断',exact:true}).click();await page.getByRole('button',{name:'开始新的一轮',exact:true}).click();
   await answer('I want to learn more knowledge.');await page.getByRole('button',{name:'针对性练习',exact:true}).click();await answer('I want to gain knowledge about astronomy.');await page.getByRole('button',{name:'进入迁移检验',exact:true}).click();
  }
  async function answer(text){await page.getByLabel('请用英语独立回答').fill(text);await page.getByRole('button',{name:'提交并查看反馈 ↗'}).click();await page.locator('.feedback .result').waitFor();}
  await prepareTransfer();await answer('I want to learn more knowledge about cooking.');await page.getByRole('button',{name:'请求提示',exact:true}).click();await answer('I would like to learn about cooking.');await page.getByText('提示后成功',{exact:true}).waitFor();await page.getByRole('button',{name:'结束本轮',exact:true}).click();
  await prepareTransfer();await answer('I hope to learn about astronomy.');await page.getByRole('button',{name:'降低难度再试',exact:true}).click();await answer('I would like to learn about cooking.');await page.getByText('重试后成功',{exact:true}).waitFor();await page.getByRole('button',{name:'结束本轮',exact:true}).click();
  const all=await page.evaluate(()=>JSON.parse(localStorage.getItem('englishmind.practice.v2')));assert.equal(all.length,3);assert.deepEqual(all[0].transferResults,['failure','retry_success']);assert.deepEqual(all[1].transferResults,['partial','hinted_success']);assert.equal(all[1].hintCount,1);assert.equal(all[0].retryCount,1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
  console.log(`PASS Chromium ${width}px: 3 teaching cases, answers hidden, refresh, true counters, local records and no overflow`);await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS browser console: no errors');
}finally{await browser.close();}
