// Pure reconciliation worker, called by a private scheduler. Never browser-facing.
import { reconcileCappedVoice } from './live-voice-daily-preview.ts';
export type ReconcileRow = { conversation_id: string; created_at: string };
export async function runLiveVoiceReconciliation(deps: {
 enabled: boolean;
 agentId: string;
 versionId: string;
 listIssued: () => Promise<ReconcileRow[]>;
 getConversation: (id: string) => Promise<unknown>;
 settle: (id: string, seconds: number) => Promise<unknown>;
 nowMs?: number;
}) {
 if (!deps.enabled || !deps.agentId || !deps.versionId) return { disabled: true };
 const rows=await deps.listIssued();
 const results:{conversationId:string;status:string}[]=[];
 for (const row of rows) {
  if (!row.conversation_id?.startsWith('conv_')) continue;
  // Do not requery fresh tickets. Default job cadence is once per minute.
  if (Date.parse(row.created_at) > (deps.nowMs ?? Date.now()) - 60_000) continue;
  try {
   const result:any=await reconcileCappedVoice(row.conversation_id,deps.agentId,deps.versionId,deps.getConversation,deps.settle);
   results.push({conversationId:row.conversation_id,status:result?.pending?'pending':result?.provider_overrun?'overrun':'settled'});
  } catch {
   // Ambiguous/failed provider checks leave debit held; never refund on timeout.
   results.push({conversationId:row.conversation_id,status:'unverified'});
  }
 }
 return { results };
}
