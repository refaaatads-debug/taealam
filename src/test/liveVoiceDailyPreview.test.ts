import { describe, it, expect } from 'vitest';
import { issueCappedVoiceTicket, reconcileCappedVoice, type VoiceCapDependencies } from '../../supabase/functions/_shared/live-voice-daily-preview';
function fixture() {
 const config={agent_id:'agent_a',version_id:'version_a',conversation_config:{conversation:{max_duration_seconds:300}},platform_settings:{auth:{enable_auth:true},overrides:{conversation_config_override:{conversation:{max_duration_seconds:false},agent:{prompt:{prompt:false}}}}}};
 const calls:string[]=[];
 const deps:VoiceCapDependencies={enabled:true,agentId:'agent_a',versionId:'version_a',getAgentVersion:async()=>config,
 reserve:async id=>{calls.push(id);return {allowed:true,reservation_id:'res_a',max_seconds:300}},
 mint:async()=>{calls.push('mint');return 'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_a&conversation_id=conv_a&conversation_signature=secret'},
 bind:async()=>{calls.push('bind');return true}};
 return {config,calls,deps};
}
describe('daily cap preview ticket gate',()=>{
 it('disabled by default in adapters; does not reserve when disabled',async()=>{const f=fixture();f.deps.enabled=false;await expect(issueCappedVoiceTicket('u',f.deps)).rejects.toThrow('cap_not_ready');expect(f.calls).toEqual([])});
 it('binds before returning single-use link',async()=>{const f=fixture();const r=await issueCappedVoiceTicket('u',f.deps);expect(r.allowed).toBe(true);expect(f.calls).toEqual(['u','mint','bind']);});
 it.each([60,600,900,undefined])('rejects unapproved provider maximum %j',async n=>{const f=fixture();f.config.conversation_config.conversation.max_duration_seconds=n as any;await expect(issueCappedVoiceTicket('u',f.deps)).rejects.toThrow('unsafe_provider_version');expect(f.calls).toEqual([])});
 it('rejects public agent',async()=>{const f=fixture();f.config.platform_settings.auth.enable_auth=false;await expect(issueCappedVoiceTicket('u',f.deps)).rejects.toThrow('unsafe_provider_version')});
 it('rejects client duration override',async()=>{const f=fixture();f.config.platform_settings.overrides.conversation_config_override.conversation.max_duration_seconds=true;await expect(issueCappedVoiceTicket('u',f.deps)).rejects.toThrow('unsafe_provider_version')});
 it('rejects mismatched version',async()=>{const f=fixture();f.config.version_id='other';await expect(issueCappedVoiceTicket('u',f.deps)).rejects.toThrow('unsafe_provider_version')});
 it('does not mint when budget denied',async()=>{const f=fixture();f.deps.reserve=async()=>({allowed:false,reason:'daily_limit'});expect(await issueCappedVoiceTicket('u',f.deps)).toEqual({allowed:false,reason:'daily_limit'});expect(f.calls).toEqual([])});
 it('fails closed on reservation error',async()=>{const f=fixture();f.deps.reserve=async()=>{throw Error('db')};await expect(issueCappedVoiceTicket('u',f.deps)).rejects.toThrow('db');expect(f.calls).toEqual([])});
 it('does not return a ticket on binding failure',async()=>{const f=fixture();f.deps.bind=async()=>false;await expect(issueCappedVoiceTicket('u',f.deps)).rejects.toThrow('binding_failed')});
 it.each(['wss://evil.test/x?conversation_id=conv_a','wss://api.elevenlabs.io/x?agent_id=other&conversation_id=conv_a&conversation_signature=x','wss://api.elevenlabs.io/x?agent_id=agent_a&conversation_signature=x'])('rejects bad ticket %s',async url=>{const f=fixture();f.deps.mint=async()=>url;await expect(issueCappedVoiceTicket('u',f.deps)).rejects.toThrow('unsafe_signed_url')});
});
describe('provider reconciliation',()=>{
 const call={agent_id:'agent_a',version_id:'version_a',conversation_id:'conv_a',status:'done',metadata:{call_duration_secs:123}};
 it('uses authenticated provider duration',async()=>{const got:any[]=[];await reconcileCappedVoice('conv_a','agent_a','version_a',async()=>call,async(...a)=>got.push(a));expect(got).toEqual([['conv_a',123]])});
 it('does not refund in-progress',async()=>{expect(await reconcileCappedVoice('conv_a','agent_a','version_a',async()=>({...call,status:'in-progress'}),async()=>{throw Error('bad')})).toEqual({pending:true})});
 it('rejects wrong provider conversation',async()=>{await expect(reconcileCappedVoice('conv_a','agent_a','version_a',async()=>({...call,agent_id:'other'}),async()=>null)).rejects.toThrow('conversation_mismatch')});
 it.each([-1,1.2,undefined,'123'])('rejects malformed duration %j',async n=>{await expect(reconcileCappedVoice('conv_a','agent_a','version_a',async()=>({...call,metadata:{call_duration_secs:n}}),async()=>null)).rejects.toThrow('invalid_duration')});
});
