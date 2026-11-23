import {describe,it,expect} from 'vitest';
import {providerMp3Seconds,generateBudgetedTts} from '../../supabase/functions/_shared/tts-daily-budget-preview';
function mp3(frames:number){const out=new Uint8Array(417*frames);for(let i=0;i<frames;i++){out.set([255,251,144,0],i*417)}return out;}
describe('server-owned MP3 duration',()=>{
 it('counts samples not file byte estimate',()=>expect(providerMp3Seconds(mp3(100))).toBe(3));
 it('counts padding frames conservatively',()=>expect(providerMp3Seconds(mp3(11485))).toBe(301));
 it.each([new Uint8Array(),new Uint8Array([1,2,3]),mp3(2).slice(0,-1)])('rejects malformed %j',v=>expect(()=>providerMp3Seconds(v)).toThrow());
 it('rejects unexpected bitrate',()=>{const b=mp3(1);b[2]=0xa0;expect(()=>providerMp3Seconds(b)).toThrow('unsupported_mp3')});
 it('skips declared ID3 header',()=>{const b=new Uint8Array(427);b.set([73,68,51,4,0,0,0,0,0,0]);b.set(mp3(1),10);expect(providerMp3Seconds(b)).toBe(1)});
});
describe('shared TTS budget',()=>{
 const fixture=()=>{const calls:string[]=[];return {calls,deps:{userId:'u',operationId:'tts_a',reserve:async()=>({allowed:true,reservation_id:'r',max_seconds:300}),bind:async()=>{calls.push('bind');return true},generate:async()=>{calls.push('generate');return mp3(100)},settle:async()=>{calls.push('settle');return {ok:true}}}}};
 it('binds and settles measured duration before audio delivery',async()=>{const f=fixture();const r=await generateBudgetedTts(f.deps);expect(r.seconds).toBe(3);expect(r.audio).toBeTruthy();expect(f.calls).toEqual(['bind','generate','settle'])});
 it('exhausted allowance never calls paid provider',async()=>{const f=fixture();f.deps.reserve=async()=>({allowed:false,reason:'daily_limit'} as any);expect(await generateBudgetedTts(f.deps)).toEqual({audio:null,reason:'daily_limit'});expect(f.calls).toEqual([])});
 it('withholds over-budget generated file, reports seconds',async()=>{const f=fixture();f.deps.reserve=async()=>({allowed:true,reservation_id:'r',max_seconds:1});const r=await generateBudgetedTts(f.deps);expect(r.audio).toBeNull();expect(r.reason).toBe('audio_exceeds_budget')});
 it('does not refund ambiguous provider error',async()=>{const f=fixture();f.deps.generate=async()=>{throw Error('timeout')};await expect(generateBudgetedTts(f.deps)).rejects.toThrow('timeout');expect(f.calls).toEqual(['bind'])});
 it('fails closed before returning audio on settlement error',async()=>{const f=fixture();f.deps.settle=async()=>({ok:false});await expect(generateBudgetedTts(f.deps)).rejects.toThrow('settlement_failed')});
});
