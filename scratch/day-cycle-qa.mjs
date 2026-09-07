import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true});const results={checks:[],errors:[]};
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  page.on('pageerror',error=>results.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/THREE|shader/i.test(message.text()))results.errors.push(message.text());});
  await page.route('**/api/auth/me',route=>route.fulfill({status:401,json:{success:false}}));
  await page.goto('http://127.0.0.1:5174',{waitUntil:'domcontentloaded'});
  await page.locator('.garden-stage.is-ready').waitFor({timeout:30000});
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await page.locator('#garden-username').fill('day-cycle-input');
  await page.locator('.garden-day-trigger').click();
  for(const name of ['Noon','Sunset','Night','Dawn']){
    await page.getByRole('button',{name,exact:true}).click();
    if(name==='Noon'||name==='Night') await page.waitForFunction(expected=>document.querySelector('.garden-login')?.dataset.dayPeriod===expected,name==='Night'?'night':'day');
    await page.waitForTimeout(250);
    await page.screenshot({path:`outputs/wind-garden/cycle-${name}.png`});
    const phase=await page.locator('.garden-login').getAttribute('data-day-period');
    if(name==='Noon')assert.equal(phase,'day');if(name==='Night')assert.equal(phase,'night');
  }
  results.checks.push('Dawn, noon, sunset and night render without shader errors');
  assert.equal(await page.getByRole('button',{name:'One day / 2 minutes'}).isDisabled(),true);
  results.checks.push('Reduced motion disables automatic time-lapse and preserves manual controls');
  await page.locator('input[type=range]').fill('0');assert.match(await page.locator('.garden-day-reading').innerText(),/00:00/);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'One day / 2 minutes'}).click();
  await page.waitForTimeout(650);const value=Number(await page.locator('input[type=range]').inputValue());assert.ok(value>0);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const frozen=await page.locator('input[type=range]').inputValue();await page.waitForTimeout(350);assert.equal(await page.locator('input[type=range]').inputValue(),frozen);
  results.checks.push('Accelerated cycle advances time; pause holds its selected time');
  await page.getByRole('button',{name:'Back to live'}).click();assert.equal(await page.locator('.garden-day-mode').innerText(),'LIVE');
  assert.equal(await page.locator('#garden-username').inputValue(),'day-cycle-input');
  results.checks.push('Return to live works and preserves authentication input');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Night',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const panel=await page.locator('.garden-day-panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=390);
  await page.screenshot({path:'outputs/wind-garden/cycle-mobile.png',fullPage:true});
  results.checks.push('Time controls fit 390px mobile');
  assert.deepEqual(results.errors,[]);
}catch(error){results.failure=error.stack;process.exitCode=1;}
finally{fs.writeFileSync('outputs/wind-garden/day-cycle-browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();}
