import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
const server = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4177'], {stdio: 'ignore'});
const browser = await chromium.launch({executablePath:'/opt/google/chrome/chrome', headless:true, args:['--no-sandbox']});
try {
  const page = await browser.newPage();

  for (let n=0;n<50;n++) { try {await page.goto('http://127.0.0.1:4177/preview/voice-tutor.html', {waitUntil:'domcontentloaded',timeout:2000});break;}catch {await new Promise(r=>setTimeout(r,200));} }
  await page.getByRole("heading", {name:"المدرس المساعد",exact:true}).waitFor({timeout:8000});
  await Promise.race([page.evaluate(()=>document.fonts.ready),new Promise(r=>setTimeout(r,2500))]);
  for (const [label,width,height] of [['mobile',390,1020],['desktop',1280,1080]]) {
    await page.setViewportSize({width,height});
    await page.getByRole('button', {name:'عرض مثال للشرح'}).click();
    await page.waitForTimeout(200);
    await page.screenshot({path:`/downloads/voice-tutor-${label}.png`,fullPage:true});
    if(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth)) throw new Error('horizontal overflow');
    await page.getByRole('button', {name:'إنهاء المثال'}).click();
  }
  await page.setViewportSize({width:390,height:1020});
  await page.screenshot({path:'/downloads/voice-tutor-idle.png',fullPage:true});
  console.log('Captured mobile 390px, desktop 1280px, idle. No horizontal overflow.');
} finally {await browser.close();server.kill();}
