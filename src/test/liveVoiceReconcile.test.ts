import {describe,it,expect} from 'vitest';
import {runLiveVoiceReconciliation} from '../../supabase/functions/_shared/live-voice-reconcile';
describe('private provider reconcile worker',()=>{
 const base={enabled:true,agentId:'agent_a',versionId:'v_a',nowMs:180000,listIssued:async()=>[{conversation_id:'conv_a',created_at:new Date(0).toISOString()}],getConversation:async()=>({conversation_id:'conv_a',agent_id:'agent_a',version_id:'v_a',status:'done',metadata:{call_duration_secs:20}}),settle:async()=>({ok:true})};
 it('disabled worker never reads provider',async()=>{expect(await runLiveVoiceReconciliation({...base,enabled:false,getConversation:async()=>{throw Error()}})).toEqual({disabled:true})});
 it('settles verified terminal',async()=>expect(await runLiveVoiceReconciliation(base)).toEqual({results:[{conversationId:'conv_a',status:'settled'}]}));
 it('keeps ambiguous call held',async()=>expect(await runLiveVoiceReconciliation({...base,getConversation:async()=>{throw Error()}})).toEqual({results:[{conversationId:'conv_a',status:'unverified'}]}));
 it('does not query fresh ticket',async()=>expect(await runLiveVoiceReconciliation({...base,nowMs:1000})).toEqual({results:[]}));
 it('propagates overrun status',async()=>expect(await runLiveVoiceReconciliation({...base,settle:async()=>({ok:true,provider_overrun:true})})).toEqual({results:[{conversationId:'conv_a',status:'overrun'}]}));
});
