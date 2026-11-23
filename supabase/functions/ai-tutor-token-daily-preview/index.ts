import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0?bundle';
import { getProviderApiKey } from '../_shared/ai-models.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { issueCappedVoiceTicket } from '../_shared/live-voice-daily-preview.ts';

// PREVIEW ONLY. Not routed or deployed. Disabled unless explicitly configured.
Deno.serve(async (req: Request) => {
 const headers = { ...getCorsHeaders(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
 if (req.method === 'OPTIONS') return new Response(null, { headers });
 if (req.method !== 'POST') return new Response('{}', {status:405,headers});
 if (Deno.env.get('LIVE_VOICE_DAILY_CAP_ENABLED') !== 'true')
   return new Response(JSON.stringify({reason_code:'cap_not_ready'}), {status:503,headers});
 const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 try {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '');
  const {data:{user},error} = await db.auth.getUser(token);
  if (error || !user) return new Response('{}',{status:401,headers});
  const key = await getProviderApiKey('elevenlabs','ELEVENLABS_API_KEY');
  if (!key) throw Error('provider_unavailable');
  const api = async(path:string) => {
   const r=await fetch('https://api.elevenlabs.io/v1/convai/'+path,{headers:{'xi-api-key':key},signal:AbortSignal.timeout(10_000)});
   if (!r.ok) throw Error('provider_unavailable');
   return r.json();
  };
  const agentId=Deno.env.get('LIVE_VOICE_CAPPED_AGENT_ID') ?? '';
  const versionId=Deno.env.get('LIVE_VOICE_CAPPED_VERSION_ID') ?? '';
  const result=await issueCappedVoiceTicket(user.id,{
   enabled:true,agentId,versionId,
   getAgentVersion:async(a,v)=>{
    const config=await api('agents/'+encodeURIComponent(a)+'?version_id='+encodeURIComponent(v));
    const branches=await api('agents/'+encodeURIComponent(a)+'/branches?include_archived=true');
    const tip=await api('agents/'+encodeURIComponent(a));
    config.isolated_branch_verified=branches.results?.length===1 && (branches.meta?.total===undefined || branches.meta.total===1) && branches.results[0].id===config.main_branch_id && tip.version_id===v;
    return config;
   },
   reserve:async(uid)=>{const r=await db.rpc('reserve_live_voice',{p_user:uid});if(r.error)throw Error('reservation_failed');return r.data;},
   mint:async(a,v)=>{const q=new URLSearchParams({agent_id:a,version_id:v,include_conversation_id:'true'});return (await api('conversation/get-signed-url?'+q)).signed_url;},
   bind:async(id,c)=>{const r=await db.rpc('bind_live_voice',{p_reservation:id,p_conversation:c});if(r.error)throw Error('binding_failed');return r.data===true;},
  });
  return new Response(JSON.stringify(result),{status:result.allowed?200:429,headers});
 } catch {
  // Never log provider ticket, JWT, API key, or provider error bodies.
  return new Response(JSON.stringify({reason_code:'cap_unavailable'}),{status:503,headers});
 }
});
