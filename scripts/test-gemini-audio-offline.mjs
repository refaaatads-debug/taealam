import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','8095'],{cwd,env:{...process.env,VITE_SUPABASE_URL:'https://preview.invalid',VITE_SUPABASE_PUBLISHABLE_KEY:'offline-placeholder'},stdio:'ignore'});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8095')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();
 await page.route('https://**/*',route=>route.abort());
 await page.goto('http://127.0.0.1:8095/gemini-adult-pilot.html');
 const result=await page.evaluate(async()=>{
  const {createGeminiAudio}=await import('/src/lib/geminiAudio.ts');
  const {encodePcm16}=await import('/src/lib/geminiPcm.ts');
  let chunks=0;let speaking=false;let tracks=[];
  const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async options=>{const stream=await get(options);tracks=stream.getTracks();return stream;};
  const audio=await createGeminiAudio(()=>chunks++,value=>{speaking=value;});
  await new Promise(r=>setTimeout(r,500));
  if(!chunks)throw Error('microphone_pcm_missing');
  audio.setMuted(true);const atMute=chunks;await new Promise(r=>setTimeout(r,300));
  if(chunks!==atMute)throw Error('mute_leaks_pcm');
  const samples=Float32Array.from({length:24000},(_,i)=>Math.sin(2*Math.PI*440*i/24000)*.1);
  audio.play(encodePcm16(samples));
  if(!speaking)throw Error('play_state_missing');
  await new Promise(r=>setTimeout(r,100));
  const outputLevel=audio.level();if(outputLevel<=0)throw Error('output_meter_missing');
  audio.interrupt();if(speaking||audio.level()!==0)throw Error('interruption_failed');
  audio.close();audio.close();
  if(tracks.some(track=>track.readyState!=='ended'))throw Error('microphone_not_stopped');
  return {chunks,mutedNoSend:true,syntheticPlayback:true,outputLevel,interruptionFlush:true,tracksEnded:true};
 });
 console.log('OFFLINE_AUDIO_BROWSER_PASS',JSON.stringify(result));
}finally{await browser?.close();server.kill();}
