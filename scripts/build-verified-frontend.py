#!/usr/bin/env python3
"""Build-only config gate. No credentials printed, no deployment or network calls."""
import os,pathlib,re,subprocess,sys,urllib.parse
root=pathlib.Path(__file__).resolve().parents[1];env=dict(os.environ)
# Public browser configuration files only, explicit paths supplied by operator.
for name in ['.env']+sys.argv[1:]:
 p=pathlib.Path(name) if pathlib.Path(name).is_absolute() else root/name
 for line in p.read_text().splitlines():
  if not line.strip() or line.lstrip().startswith('#') or '=' not in line:continue
  k,v=line.split('=',1);k=k.strip();v=v.strip().strip('\"').strip("'")
  if k.startswith('VITE_') and k not in env:env[k]=v
required=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_TURNSTILE_SITE_KEY','VITE_GOOGLE_MAPS_API_KEY']
for k in required:
 if not env.get(k) or any(x in env[k].lower() for x in ['placeholder','validation.invalid']):raise SystemExit('Invalid or missing '+k)
assert urllib.parse.urlsplit(env['VITE_SUPABASE_URL']).scheme=='https','Supabase URL must be HTTPS'
assert env['VITE_SUPABASE_PUBLISHABLE_KEY'].startswith(('eyJ','sb_publishable_')),'Invalid publishable key format'
assert re.fullmatch(r'0x4[A-Za-z0-9_-]+',env['VITE_TURNSTILE_SITE_KEY']),'Invalid Turnstile key format'
assert re.fullmatch(r'AIza[A-Za-z0-9_-]{35}',env['VITE_GOOGLE_MAPS_API_KEY']),'Invalid browser Maps key format'
env.setdefault('NODE_OPTIONS','--max-old-space-size=1400')
subprocess.run(['npm','run','build'],cwd=root,env=env,check=True)
assets=list((root/'dist/assets').glob('*'));texts=[p.read_bytes() for p in assets if p.suffix in ['.js','.css']]
for k in required:
 assert any(env[k].encode() in text for text in texts),'Built assets omit '+k
print('ALL_FOUR_PUBLIC_CONFIG_FIELDS_VALIDATED_AND_EMBEDDED')
