#!/usr/bin/env python3
"""
أداة صيانة Edge Functions — تشغيل قبل أي deploy
Usage: python3 scripts/check-edge-functions.py
"""
import glob, os, re, subprocess

FUNCS_SRC  = '/root/ajyal-frontend/supabase/functions'
FUNCS_VOL  = '/root/taealam/supabase_setup/docker/volumes/functions'
CORRECT_VER = '2.45.0?bundle'
CORRECT_URL = f'https://esm.sh/@supabase/supabase-js@{CORRECT_VER}'

ok, fixed = [], []

for ts_file in glob.glob(f'{FUNCS_SRC}/**/index.ts', recursive=True):
    fname = os.path.basename(os.path.dirname(ts_file))
    with open(ts_file) as f: c = f.read()
    new_c = re.sub(
        r'https://esm\.sh/@supabase/supabase-js@[^"\'\s]*',
        CORRECT_URL, c
    )
    if new_c != c:
        with open(ts_file, 'w') as f: f.write(new_c)
        fixed.append(fname)
    else:
        ok.append(fname)

print(f'OK ({len(ok)}): {ok}')
if fixed:
    print(f'Fixed ({len(fixed)}): {fixed}')
    subprocess.run(['rsync', '-a', f'{FUNCS_SRC}/', f'{FUNCS_VOL}/'])
    subprocess.run(['docker', 'restart', 'supabase-edge-functions'])
    print('Synced to volume + container restarted ✅')
    # Git commit
    os.chdir(FUNCS_SRC + '/../..')
    subprocess.run(['git', 'add', 'supabase/functions/'])
    subprocess.run(['git', 'commit', '-m', 'fix: normalize supabase-js to 2.45.0?bundle'])
    subprocess.run(['git', 'push', 'origin', 'main'])
else:
    print('All functions healthy — no action needed ✅')
