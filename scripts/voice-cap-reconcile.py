#!/usr/bin/env python3
"""Private VPS cron worker. Provider GETs only, no ticket issuance or generation.
Install with root-only mode and flock, once/minute. Never expose through HTTP.
"""
import json, pathlib, re, subprocess, urllib.request
ROOT=pathlib.Path('/root/taealam/supabase_setup/docker/volumes/functions')
def sql(query):
 return subprocess.check_output(['docker','exec','-i','supabase-db','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],input=query,text=True,timeout=15).strip()
def main():
 cfg=json.loads((ROOT/'_shared/live-voice-cap-config.json').read_text())
 if cfg.get('enabled') is not True:return
 agent,version=cfg.get('agentId',''),cfg.get('versionId','')
 if not re.fullmatch(r'agent_[A-Za-z0-9]+',agent) or not re.fullmatch(r'agtvrsn_[A-Za-z0-9]+',version):raise ValueError('unsafe_config')
 key=json.loads(sql("SELECT public.get_ai_provider_runtime_config('elevenlabs')::text")).get('api_key')
 if not key:
  env=json.loads(subprocess.check_output(['docker','inspect','supabase-edge-functions'],text=True,timeout=10))[0]['Config']['Env']
  key=next((x.split('=',1)[1] for x in env if x.startswith('ELEVENLABS_API_KEY=')),None)
 if not key:raise ValueError('provider_unavailable')
 rows=json.loads(sql("SELECT coalesce(json_agg(r),'[]') FROM (SELECT conversation_id FROM public.live_voice_reservations WHERE kind='live' AND state='issued' AND created_at < clock_timestamp()-interval '60 seconds' ORDER BY created_at LIMIT 100) r"))
 counts={'settled':0,'pending':0,'unverified':0,'overrun':0}
 for row in rows:
  try:
   cid=row['conversation_id']
   if not re.fullmatch(r'conv_[A-Za-z0-9]+',cid):raise ValueError('invalid_id')
   req=urllib.request.Request('https://api.elevenlabs.io/v1/convai/conversations/'+cid,headers={'xi-api-key':key})
   with urllib.request.urlopen(req,timeout=8) as resp:call=json.load(resp)
   if call.get('conversation_id')!=cid or call.get('agent_id')!=agent or call.get('version_id')!=version:raise ValueError('conversation_mismatch')
   if call.get('status') not in ['done','failed']:counts['pending']+=1;continue
   seconds=call.get('metadata',{}).get('call_duration_secs')
   if type(seconds) is not int or not 0<=seconds<=2147483647:raise ValueError('duration_invalid')
   result=json.loads(sql("SELECT public.settle_live_voice('"+cid+"',"+str(seconds)+")::text"))
   if result.get('ok') is not True:raise ValueError('settlement_failed')
   counts['overrun' if result.get('provider_overrun') else 'settled']+=1
  except Exception:counts['unverified']+=1
 print(json.dumps(counts))
if __name__=='__main__':main()
