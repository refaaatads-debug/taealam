import subprocess,json,urllib.request,urllib.error,base64,hmac,hashlib,time,pathlib,sys
ROOT=pathlib.Path('/root/taealam/supabase_setup/docker/volumes/functions');STAGE=pathlib.Path('/root/shared-voice-cap-stage')
def sql(q):return subprocess.check_output(['docker','exec','-i','supabase-db','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],input=q,text=True,timeout=20).strip()
def enc(x):return base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).decode().rstrip('=')
env=dict(x.split('=',1) for x in json.loads(subprocess.check_output(['docker','inspect','supabase-edge-functions'],text=True))[0]['Config']['Env'] if '=' in x)
authenv=dict(x.split('=',1) for x in json.loads(subprocess.check_output(['docker','inspect','supabase-auth'],text=True))[0]['Config']['Env'] if '=' in x);secret=env.get('JWT_SECRET') or authenv['GOTRUE_JWT_SECRET']
def token(uid):
 t=int(time.time());h=enc({'alg':'HS256','typ':'JWT'});b=enc({'sub':uid,'role':'authenticated','aud':'authenticated','iss':'supabase','iat':t,'exp':t+120});return h+'.'+b+'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),(h+'.'+b).encode(),hashlib.sha256).digest()).decode().rstrip('=')
def call(path,body,uid=None):
 headers={'Content-Type':'application/json'}
 if uid:headers['Authorization']='Bearer '+token(uid)
 try:
  with urllib.request.urlopen(urllib.request.Request('https://ajyalalmaerifa.com/functions/v1/'+path,data=json.dumps(body).encode(),headers=headers),timeout=20) as r:return r.status,json.load(r)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
if '--web-only' in sys.argv:
 assert pathlib.Path('/var/www/html/index.html').read_bytes()==(STAGE/'dist/index.html').read_bytes()
 for url in ['https://ajyalalmaerifa.com/','https://ajyalalmaerifa.com/login','https://ajyalalmaerifa.com/healthz']:
  with urllib.request.urlopen(url,timeout=15) as r:assert r.status==200
 print('WEB_INDEX_AND_HEALTH_PASS');sys.exit(0)
for path in ['ai-tutor-token','ai-tutor-chat']:
 status,_=call(path,{});assert status==401,(path,status);print('ANON_DENIED',path,status)
rows=json.loads(sql("SELECT coalesce(json_agg(t),'[]') FROM (SELECT u.id,p.account_status,p.is_deleted,EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id) has_role,EXISTS(SELECT 1 FROM user_subscriptions s JOIN subscription_plans sp ON sp.id=s.plan_id WHERE s.user_id=u.id AND s.is_active AND s.remaining_minutes>0 AND sp.tier='premium') premium FROM auth.users u LEFT JOIN profiles p ON p.user_id=u.id) t"))
valid=next(r for r in rows if r['account_status']=='active' and r['is_deleted'] is False and r['has_role'] and r['premium']);uid=valid['id']
# Authenticated malformed chat stops before model/TTS, no paid request.
status,_=call('ai-tutor-chat',{},uid);assert status==400,status;print('AUTH_CHAT_MALFORMED',status)
for label,pred in [('ROLELESS',lambda r:not r['has_role']),('NO_PREMIUM',lambda r:r['has_role'] and not r['premium']),('INACTIVE',lambda r:r['account_status'] not in ['active',None] or r['is_deleted'] is True)]:
 r=next((r for r in rows if pred(r)),None)
 if r:
  status,_=call('ai-tutor-token',{},r['id']);assert status==403,(label,status);print(label,status)
# Ledger logic rehearsal is a rolled-back transaction, no ticket minted or usage kept.
q="BEGIN; SELECT reserve_live_voice('"+uid+"','live'); SELECT reserve_live_voice('"+uid+"','tts'); ROLLBACK;"
r=sql(q);assert '"max_seconds": 300' in r and 'conversation_reserved' in r;print('TRANSACTION_LEDGER_300_AND_SHARED_LOCK_PASS')
priv=json.loads(sql("SELECT json_build_object('tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('live_voice_days','live_voice_reservations') AND c.relrowsecurity),'client_rpc',has_function_privilege('authenticated','reserve_live_voice(uuid,text)','EXECUTE'),'service_rpc',has_function_privilege('service_role','reserve_live_voice(uuid,text)','EXECUTE'))"));assert priv=={'tables':2,'client_rpc':False,'service_rpc':True},priv;print('RLS_SERVICE_PRIVILEGES_PASS')
cfg=json.loads((ROOT/'_shared/live-voice-cap-config.json').read_text());assert cfg['enabled'] is True
key=json.loads(sql("SELECT public.get_ai_provider_runtime_config('elevenlabs')::text")).get('api_key') or env.get('ELEVENLABS_API_KEY')
req=urllib.request.Request('https://api.elevenlabs.io/v1/convai/agents/'+cfg['agentId']+'?version_id='+cfg['versionId'],headers={'xi-api-key':key})
with urllib.request.urlopen(req,timeout=10) as r:p=json.load(r)
assert p['version_id']==cfg['versionId'] and p['conversation_config']['conversation']['max_duration_seconds']==299 and p['platform_settings']['auth']['enable_auth'] is True
print('PROVIDER_PINNED_299_AUTH_PASS')
for f in ['ai-tutor-token/index.ts','ai-tutor-chat/index.ts','_shared/live-voice-cap-config.json','_shared/live-voice-cap-config.ts','_shared/live-voice-daily-preview.ts','_shared/tts-daily-budget-preview.ts','_shared/premium-voice.ts']:
 assert (ROOT/f).read_bytes()==(STAGE/'supabase/functions'/f).read_bytes(),f
if '--backend-only' not in sys.argv:assert pathlib.Path('/var/www/html/index.html').read_bytes()==(STAGE/'dist/index.html').read_bytes()
print('LIVE_SOURCE_EXACT_PASS')
for url in ['https://ajyalalmaerifa.com/','https://ajyalalmaerifa.com/healthz']:
 with urllib.request.urlopen(url,timeout=15) as r:assert r.status==200
print('WEB_HEALTH_PASS_NO_PAID_CALLS')
