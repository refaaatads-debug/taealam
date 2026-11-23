import {describe,it,expect} from 'vitest';
import {hasPremiumVoice,shouldGenerateTutorAudio} from '../../supabase/functions/_shared/premium-voice';
const sub=(tier:string,active=true,minutes=30)=>({is_active:active,remaining_minutes:minutes,subscription_plans:{tier}});
describe('legacy tutor paid audio entitlement',()=>{
 it('allows active premium with balance only',()=>{
  expect(hasPremiumVoice([sub('premium')])).toBe(true);
  for(const tier of ['free','basic','standard'])expect(hasPremiumVoice([sub(tier)])).toBe(false);
  expect(hasPremiumVoice([sub('premium',false)])).toBe(false);
  expect(hasPremiumVoice([sub('premium',true,0)])).toBe(false);
  expect(hasPremiumVoice([])).toBe(false);
 });
 it('preserves text-only calls without generating audio',()=>{
  expect(shouldGenerateTutorAudio(false,[sub('premium')])).toBe(false);
  expect(shouldGenerateTutorAudio(false,[sub('free')])).toBe(false);
 });
 it('defaults to audio only for premium, old speak:true callers get no paid voice otherwise',()=>{
  expect(shouldGenerateTutorAudio(undefined,[sub('premium')])).toBe(true);
  expect(shouldGenerateTutorAudio(true,[sub('free')])).toBe(false);
  expect(shouldGenerateTutorAudio(undefined,[sub('standard')])).toBe(false);
 });
});
