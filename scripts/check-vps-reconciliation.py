import pathlib,json,hashlib,re,subprocess
r=pathlib.Path(__file__).resolve().parents[1];d=r/'docs/reconciliation/20261124';e=json.loads((d/'evidence.json').read_text())
for n,h in e['runtimeFunctions'].items():
 p=r/'supabase/functions'/n
 assert p.exists() and hashlib.sha256(p.read_bytes()).hexdigest()==h,n
assert len(list((d/'vps-patches').rglob('*.patch')))==20
assert len(list((d/'migrations-review').glob('*.sql.review')))==4
for p in (d/'migrations-review').glob('*.sql.review'):assert not (r/'supabase/migrations'/p.name.removesuffix('.review')).exists()
for n in ['src/components/admin/WithdrawalRequestsTab.tsx','src/components/admin/TeacherProfilesTab.tsx','src/pages/StudentDashboard.tsx','src/pages/TeacherDashboard.tsx','src/pages/Chat.tsx']:
 assert (r/n).read_bytes()==subprocess.check_output(['git','-C',str(r),'show',e['webBase']+':'+n]),n
s=(r/'src/pages/AdminTeacherProfile.tsx').read_text();assert '<TeacherCertificatesList certificates={data.certificates}' in s
s=(r/'src/components/admin/UserManagementTab.tsx').read_text();assert 'Permissions grouped by section' in s and 'remaining_minutes' in s and 'restoreUser' in s
s=(r/'src/pages/AdminDashboard.tsx').read_text();assert 'case "admin_permissions": return <AdminPermissionsTab />' in s and 'approval_status: "rejected"' in s
s=(r/'supabase/functions/ai-tutor-token/index.ts').read_text();assert s.index('live_voice_disabled')<s.index('Deno.env.get')
for p in (r/'src').rglob('*'):
 if p.suffix in ['.ts','.tsx']:assert not re.search(r'^<{7}|^>{7}',p.read_text(),re.M),str(p)
print('PASS: mounted runtime parity,20patches,4quarantined migrations, current financial/approval/dashboard/chat safeguards, voice off, no merge markers')
