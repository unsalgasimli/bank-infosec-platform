import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const output='outputs/wind-garden';
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results={viewports:[],checks:[],errors:[],performance:{}};
const page=await browser.newPage({viewport:{width:1440,height:900}});
// Keep visual checks independent of the unavailable session-restore backend.
await page.route('**/api/auth/me',route=>route.fulfill({status:401,contentType:'application/json',body:'{"success":false}'}));
page.on('pageerror',error=>results.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))results.errors.push(message.text());});
await page.addInitScript(()=>{
  window.__gardenDraws=0;
  for(const key of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
    const original=WebGL2RenderingContext.prototype[key];
    WebGL2RenderingContext.prototype[key]=function(...args){window.__gardenDraws++;return original.apply(this,args);};
  }
});
try {
  await page.goto('http://localhost:5173',{waitUntil:'networkidle'});
  await page.locator('.garden-stage.is-ready').waitFor({timeout:25000});
  await page.getByRole('button',{name:'EN',exact:true}).click();
  for(const [width,height] of [[2560,1440],[1920,1080],[1440,900],[1280,720],[820,1180],[390,844]]){
    await page.setViewportSize({width,height});
    await page.waitForTimeout(400);
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,submit:document.querySelector('.garden-submit').getBoundingClientRect().toJSON(),canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON()}));
    assert.equal(layout.overflow,false,`Horizontal overflow ${width}`);
    assert.ok(layout.submit.x>=0&&layout.submit.right<=width,`Visible login ${width}`);
    await page.screenshot({path:`${output}/desktop-${width}.png`,fullPage:true});
    results.viewports.push({width,height,...layout});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Catch the wind',exact:true}).click();
  for(let i=0;i<3;i++)for(let n=0;n<[2,5,7][i];n++)await page.getByRole('button',{name:new RegExp(`^Turn sail ${i+1}:`)}).click();
  await page.locator('.garden-puzzle[data-chapter="2"]').waitFor();
  for(let i=0;i<3;i++)for(let n=0;n<[1,2,3][i];n++)await page.getByRole('button',{name:new RegExp(`^Turn sail ${i+1}:`)}).click();
  await page.getByRole('heading',{name:'The garden has a secret.'}).waitFor();
  await page.screenshot({path:`${output}/puzzle-complete.png`});
  results.checks.push('Both puzzle chapters completed through accessible controls; automatic progression and coupled dials verified');
  await page.getByRole('button',{name:'Start again',exact:true}).click();
  assert.match(await page.locator('.garden-puzzle__footer').innerText(),/0 turns/);
  await page.getByRole('button',{name:'Close wind puzzle'}).click();
  const canvas=page.locator('.garden-scene canvas');const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width*.6,box.y+box.height*.4);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.47,{steps:8});await page.mouse.up();
  results.checks.push('Constrained pointer drag completed');
  await page.locator('#garden-username').fill('wasd ArrowLeft Space');
  assert.equal(await page.locator('#garden-username').inputValue(),'wasd ArrowLeft Space');
  await page.locator('#garden-password').fill('sample-password');
  await page.getByRole('button',{name:'Toggle password visibility'}).click();
  assert.equal(await page.locator('#garden-password').getAttribute('type'),'text');
  await page.getByRole('button',{name:'Toggle password visibility'}).click();
  results.checks.push('Keyboard text input and password visibility preserved');
  if(await page.getByRole('button',{name:'Pause garden',exact:true}).count())await page.getByRole('button',{name:'Pause garden',exact:true}).click();
  await page.waitForTimeout(200);let draws=await page.evaluate(()=>window.__gardenDraws);await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window.__gardenDraws),draws);results.checks.push('Pause stops WebGL draw calls');
  await page.getByRole('button',{name:'Resume garden',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);draws=await page.evaluate(()=>window.__gardenDraws);await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>window.__gardenDraws),draws);results.checks.push('Reduced motion stops continuous WebGL draws');
  await page.screenshot({path:`${output}/reduced-motion.png`});
  await page.emulateMedia({reducedMotion:'no-preference'});
  const sampleDraws=await page.evaluate(()=>window.__gardenDraws);
  results.performance.frameIntervals=await page.evaluate(()=>new Promise(resolve=>{const intervals=[];let last=performance.now();function frame(now){intervals.push(now-last);last=now;if(intervals.length<120)requestAnimationFrame(frame);else resolve({meanMs:intervals.slice(1).reduce((a,b)=>a+b)/119,p95Ms:intervals.slice(1).sort((a,b)=>a-b)[113]});}requestAnimationFrame(frame);}));
  results.performance.drawCallsDuringSample=(await page.evaluate(()=>window.__gardenDraws))-sampleDraws;
  results.performance.automaticallyPaused=await page.getByRole('button',{name:'Resume garden',exact:true}).count()>0;
  // Deliberately malformed upstream response, without sending bad credentials to LDAP.
  await page.route('**/api/auth/ldap-login',route=>route.fulfill({status:503,contentType:'text/html',body:'Temporarily unavailable'}));
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/invalid response/);
  assert.equal(await page.getByRole('button',{name:'Sign In',exact:true}).isEnabled(),true);
  results.checks.push('Malformed upstream authentication response shows an accessible error and permits retry');
  await page.unroute('**/api/auth/ldap-login');
  await page.locator('#garden-username').fill('u.gasimli');await page.locator('#garden-password').fill('');
  const skipLive=process.argv.includes('--skip-live');
  const loginResponse=skipLive?Promise.resolve(null):page.waitForResponse(response=>response.url().endsWith('/api/auth/ldap-login'),{timeout:15000}).catch(()=>null);
  if(!skipLive)await page.locator('#garden-password').press('Enter');
  const response=await loginResponse;
  const auth=response?await response.json():{success:false,message:skipLive?'Not retried: prior live attempts recorded separately':'No response before the client authentication timeout'};
  results.liveAuthentication={status:response?.status()??null,success:auth.success===true};
  if(auth.success){
    await page.locator('.garden-login.is-entering').waitFor({timeout:5000});
    await page.locator('.garden-login').waitFor({state:'detached',timeout:15000});
    await page.unroute('**/api/auth/me');
    const me=await page.request.get('http://localhost:5173/api/auth/me');
    assert.equal(me.status(),200);assert.equal((await me.json()).success,true);
    results.checks.push('Real development login: Enter submission, server identity, entrance transition, authenticated app and /api/auth/me');
    const remainingDraws=await page.evaluate(()=>window.__gardenDraws);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.__gardenDraws),remainingDraws);
    results.checks.push('Unmount stops all scene draw calls');
    await page.request.post('http://localhost:5173/api/auth/logout',{headers:{Origin:'http://localhost:5173'}});
  } else {
    results.liveAuthentication.message=auth.message||auth.error;
    // Verify the presentation handoff independently when live infrastructure is unavailable.
    const fixture={id:'presentation-fixture',displayName:'Presentation fixture',username:'presentation-fixture',email:'fixture@example.test',roles:['REQUESTER'],departmentId:'fixture',isActive:true};
    await page.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,user:fixture,users:[],tickets:[],departments:[],applications:[],assets:[],risks:[],articles:[],approvals:[],items:[],total:0})}));
    await page.getByRole('button',{name:'Sign In',exact:true}).click();
    await page.locator('.garden-login.is-entering').waitFor({timeout:5000});
    await page.locator('.garden-login').waitFor({state:'detached',timeout:5000});
    const stoppedDraws=await page.evaluate(()=>window.__gardenDraws);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>window.__gardenDraws),stoppedDraws);
    results.checks.push('Presentation-only fixture: success transition completes and unmount stops scene draws (not live authentication proof)');
  }
  const fallback=await browser.newPage({viewport:{width:390,height:844}});
  await fallback.route('**/api/auth/me',route=>route.fulfill({status:401,contentType:'application/json',body:'{"success":false}'}));
  await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/.test(kind)?null:original.call(this,kind,...args);};});
  await fallback.goto('http://localhost:5173',{waitUntil:'networkidle'});await fallback.locator('#garden-username').waitFor();
  await fallback.waitForTimeout(400);await fallback.locator('#garden-username').fill('keyboard-ready');
  assert.equal(await fallback.locator('#garden-username').inputValue(),'keyboard-ready');assert.equal(await fallback.locator('canvas').count(),0);
  await fallback.screenshot({path:`${output}/mobile-fallback.png`,fullPage:true});
  results.checks.push('Unavailable WebGL: local illustration and fully usable form');
  await fallback.getByRole('button',{name:'EN',exact:true}).click();
  await fallback.getByRole('button',{name:'Catch the wind',exact:true}).click();
  assert.equal(await fallback.getByRole('button',{name:/^Turn sail 1:/}).isEnabled(),true);
  results.checks.push('Optional puzzle remains accessible without WebGL');
  await fallback.close();
  assert.deepEqual(results.errors,[]);
} catch(error){results.failure=error.stack;process.exitCode=1;}
finally{fs.writeFileSync(`${output}/browser-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();}
