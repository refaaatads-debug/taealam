import {describe,it,expect} from 'vitest';
import {preciseProviderVoiceSeconds,fullSessionsLeft,pendingVoicePolicies} from '../../supabase/functions/_shared/pending-voice-policy';
const call=(quantity:unknown)=>({metadata:{charging:{platform_usage:{category_usage:{voice:{quantity}}}}}});
describe('pending policy comparison only',()=>{
 it('measured300.158sec must not be clipped to300',()=>expect(preciseProviderVoiceSeconds(call(5.002641476015561))).toBe(301));
 it('300 variant reserves301, so only2full sessions fit',()=>expect(fullSessionsLeft(900,'conservative300')).toBe(2));
 it('299 variant reserves300, three fit but new proof required',()=>{expect(fullSessionsLeft(900,'conservative299')).toBe(3);expect(pendingVoicePolicies.conservative299.providerMaxSeconds).toBe(299)});
 it.each([undefined,NaN,Infinity,-1,'5'])('rejects malformed quantity %s',q=>expect(()=>preciseProviderVoiceSeconds(call(q))).toThrow());
});
