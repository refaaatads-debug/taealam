import pathlib,re,hashlib,subprocess,json,os,shutil,urllib.request,urllib.error,time
base=pathlib.Path('/root/backups/disable-live-voice-20261123-231000');web=pathlib.Path('/var/www/html');functions=pathlib.Path('/root/taealam/supabase_setup/docker/volumes/functions');token=functions/'ai-tutor-token/index.ts'
assert not base.exists();base.mkdir(mode=0o700)
files=[token]+[p for p in (web/'assets').glob('AITutor-*.js') if 'محادثة صوتية حية' in p.read_text()]
assert len(files)>1
original={str(p):p.read_bytes() for p in files};indexhash=hashlib.sha256((web/'index.html').read_bytes()).hexdigest();ttshash=hashlib.sha256((functions/'ai-tutor-chat/index.ts').read_bytes()).hexdigest()
changes={}
for p in files[1:]:
 s=p.read_text(); pattern=r'([A-Za-z_$][\w$]*)\.jsxs\(([A-Za-z_$][\w$]*),\{value:"voice",className:"gap-2",children:\[([A-Za-z_$][\w$]*)\.jsx\(([A-Za-z_$][\w$]*),\{className:"h-4 w-4"\}\)," محادثة صوتية حية"\]\}\)'
 s,n=re.subn(pattern,lambda m:'false&&'+m.group(0),s);assert n==1,(p.name,n);s=s.replace('className:"w-full grid grid-cols-2"','className:"w-full grid grid-cols-1"');changes[p]=s.encode()
s=token.read_text();needle='  const rate = checkEdgeRateLimit';assert s.count(needle)==1
s=s.replace(needle,'''  // Reversible owner-requested live-conversation stop. Text and TTS stay intact.
  return new Response(JSON.stringify({ reason_code: "live_voice_disabled", error: "المحادثات الصوتية الحية متوقفة. استخدم نص + نطق." }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
'''+needle);changes[token]=s.encode()
manifest=[]
for i,(path,data) in enumerate(original.items()):
 backup=base/('file-'+str(i));backup.write_bytes(data);manifest.append({'path':path,'backup':str(backup),'sha256':hashlib.sha256(data).hexdigest()})
(base/'manifest.json').write_text(json.dumps(manifest));rollback=base/'rollback.py'
rollback.write_text('''import pathlib,json,os,subprocess
b=pathlib.Path(__file__).parent
rehearsal=os.environ.get('ROLLBACK_REHEARSAL_ROOT')
for f in json.loads((b/'manifest.json').read_text()):
 p=pathlib.Path(rehearsal)/f['path'].lstrip('/') if rehearsal else pathlib.Path(f['path'])
 p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(pathlib.Path(f['backup']).read_bytes())
if not rehearsal:subprocess.check_call(['docker','restart','supabase-edge-functions'])
''');os.chmod(rollback,0o700)
rehearsal=base/'rehearsal';rehearsal.mkdir()
for p,data in changes.items():
 target=rehearsal/str(p).lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
subprocess.check_call(['python3',str(rollback)],env={**os.environ,'ROLLBACK_REHEARSAL_ROOT':str(rehearsal)})
for p,data in original.items():assert (rehearsal/p.lstrip('/')).read_bytes()==data
print('EXACT_ROLLBACK_FILE_REHEARSAL_PASS')
try:
 for p,data in changes.items():p.write_bytes(data)
 subprocess.check_call(['docker','restart','supabase-edge-functions'],stdout=subprocess.DEVNULL)
 time.sleep(2)
 req=urllib.request.Request('https://ajyalalmaerifa.com/functions/v1/ai-tutor-token',data=b'{}',headers={'Content-Type':'application/json'})
 try:urllib.request.urlopen(req,timeout=10);raise RuntimeError('unexpected_token_success')
 except urllib.error.HTTPError as e:assert e.code==503 and json.load(e).get('reason_code')=='live_voice_disabled'
 assert hashlib.sha256((web/'index.html').read_bytes()).hexdigest()==indexhash
 assert hashlib.sha256((functions/'ai-tutor-chat/index.ts').read_bytes()).hexdigest()==ttshash
 for name in ['ai-tutor-chat']:
  try:urllib.request.urlopen(urllib.request.Request('https://ajyalalmaerifa.com/functions/v1/'+name,data=b'{}',headers={'Content-Type':'application/json'}),timeout=10)
  except urllib.error.HTTPError as e:assert e.code==401
 for url in ['https://ajyalalmaerifa.com/','https://ajyalalmaerifa.com/healthz']:
  with urllib.request.urlopen(url,timeout=10) as r:assert r.status==200
 result={'status':'live_voice_disabled','webAssets':[p.name for p in files[1:]],'tokenHTTP':503,'textTTSUnauthHTTP':401,'indexUnchanged':True,'textTTSFileUnchanged':True,'geminiNotDeployed':not (functions/'gemini-live-pilot/index.ts').exists(),'rollback':str(rollback)}
 (base/'result.json').write_text(json.dumps(result));print(json.dumps(result))
except Exception:
 subprocess.check_call(['python3',str(rollback)]);raise
