import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';
const f=vi.hoisted(()=>({user:{id:'synthetic-user'},roles:['student'],deleted:false,rejected:false,fail:false}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:f.user,loading:false,roles:f.roles})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
 const data=table==='profiles'?{is_deleted:f.deleted}:table==='teacher_profiles'?{approval_status:f.rejected?'rejected':'approved',is_approved:!f.rejected}:[];
 const q:any={};q.select=()=>q;q.eq=()=>q;q.limit=()=>q;q.maybeSingle=()=>q;
 q.then=(resolve:any,reject:any)=>(f.fail?Promise.reject(Error('synthetic network error')):Promise.resolve({data,error:null})).then(resolve,reject);return q;
}}}));
describe('reconciled account routing, isolated mock checks only',()=>{
 beforeEach(()=>Object.assign(f,{roles:['student'],deleted:false,rejected:false,fail:false}));afterEach(cleanup);
 function show(path='/student'){render(<MemoryRouter initialEntries={[path]}><ProtectedRoute><p>synthetic protected content</p></ProtectedRoute></MemoryRouter>)}
 it('blocks deleted account from protected content',async()=>{f.deleted=true;show();expect(await screen.findByRole('link')).toHaveAttribute('href','/support');expect(screen.queryByText('synthetic protected content')).not.toBeInTheDocument()});
 it('keeps support reachable while deleted',async()=>{f.deleted=true;show('/support');expect(await screen.findByText('synthetic protected content')).toBeInTheDocument()});
 it('blocks rejected teacher but retains support',async()=>{f.roles=['teacher'];f.rejected=true;show();expect(await screen.findByRole('link')).toHaveAttribute('href','/support')});
 it('allows restored student through after fresh guard mount',async()=>{show();expect(await screen.findByText('synthetic protected content')).toBeInTheDocument()});
 it('records existing fail-open behavior as a release limitation, not a security guarantee',async()=>{f.fail=true;show();expect(await screen.findByText('synthetic protected content')).toBeInTheDocument()});
});
