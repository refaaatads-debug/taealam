import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const server = spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','8094'],{cwd,env:{...process.env,VITE_SUPABASE_URL:'https://preview.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'offline-placeholder'},stdio:'ignore'});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8094/gemini-adult-pilot.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:1100},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.goto('http://127.0.0.1:8094/gemini-adult-pilot.html');
 await page.getByText('Gemini Live · تجربة للبالغين فقط').waitFor();
 await page.screenshot({path:'/downloads/gemini-adult-pilot-mobile.png',fullPage:true});
 const start=page.getByRole('button',{name:'بدء الاختبار المعتمد'});
 if(!await start.isDisabled())throw Error('consent_gate_missing');
 await page.getByRole('checkbox').check();await start.click();
 await page.getByText('سجّل الدخول بحساب الاختبار المعتمد أولاً. لا توجد جلسة مدفوعة.').waitFor();
 await page.setViewportSize({width:1100,height:1100});
 await page.screenshot({path:'/downloads/gemini-adult-pilot-desktop.png',fullPage:true});
 if(errors.length)throw Error(errors.join(';'));
 console.log('OFFLINE_UI_PASS consent gate, signed-out denial, zero provider access, mobile/desktop screenshots');
}finally{await browser?.close();server.kill();}
