import {describe,it,expect} from 'vitest';
import {hasPremiumVoice,shouldGenerateTutorAudio} from '../../supabase/functions/_shared/premium-voice';
describe('preserved premium voice entitlement',()=>{
 const sub={is_active:true,remaining_minutes:3,subscription_plans:{tier:'premium'}};
 it('supports single and array relation results',()=>{expect(hasPremiumVoice([sub])).toBe(true);expect(hasPremiumVoice([{...sub,subscription_plans:[{tier:'premium'}]}])).toBe(true)});
 it('fails closed on ambiguous array',()=>expect(hasPremiumVoice([{...sub,subscription_plans:[{tier:'premium'},{tier:'premium'}]}])).toBe(false));
 it.each([NaN,Infinity,0,-1])('rejects invalid balance %s',remaining_minutes=>expect(hasPremiumVoice([{...sub,remaining_minutes}])).toBe(false));
 it('respects explicit text only',()=>expect(shouldGenerateTutorAudio(false,[sub])).toBe(false));
});
