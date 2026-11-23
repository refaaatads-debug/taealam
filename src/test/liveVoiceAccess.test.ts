import { describe, it, expect } from 'vitest';
import { liveVoiceAccountAllowed, liveVoicePremiumAllowed, allowLiveVoiceIssuance } from '../../supabase/functions/_shared/live-voice-access';
describe('live voice account gate', () => {
  const active = { account_status: 'active', is_deleted: false };
  it('accepts active profile with role', () => expect(liveVoiceAccountAllowed(active, [{ role: 'student' }])).toBe(true));
  it.each([null, {}, { ...active, account_status: 'suspended' }, { ...active, account_status: 'inactive' }, { ...active, is_deleted: true }, { ...active, is_deleted: null }])('fails closed on profile %j', p => expect(liveVoiceAccountAllowed(p, [{role:'student'}])).toBe(false));
  it.each([{roles:null}, {roles:[]}])('rejects missing role %j', ({roles}) => expect(liveVoiceAccountAllowed(active,roles)).toBe(false));
});
describe('prepaid premium gate', () => {
  const valid={is_active:true,remaining_minutes:1,subscription_plans:{tier:'premium'}};
  it('accepts paid positive balance',()=>expect(liveVoicePremiumAllowed(valid)).toBe(true));
  it.each([0,-1,null,undefined,'10',NaN,Infinity])('rejects invalid minutes %j', n=>expect(liveVoicePremiumAllowed({...valid,remaining_minutes:n})).toBe(false));
  it('rejects inactive',()=>expect(liveVoicePremiumAllowed({...valid,is_active:false})).toBe(false));
  it('rejects lower tier',()=>expect(liveVoicePremiumAllowed({...valid,subscription_plans:{tier:'basic'}})).toBe(false));
  it('accepts relation array',()=>expect(liveVoicePremiumAllowed({...valid,subscription_plans:[{tier:'premium'}]})).toBe(true));
});
describe('best effort user burst limit',()=>{
 it('separates users and resets after minute',()=>{
  expect([0,1,2,3].map(n=>allowLiveVoiceIssuance('a',1000+n))).toEqual([true,true,true,false]);
  expect(allowLiveVoiceIssuance('b',1004)).toBe(true);
  expect(allowLiveVoiceIssuance('a',62000)).toBe(true);
 });
});
