import {renderHook,waitFor,act} from '@testing-library/react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {usePrivateStorageRows} from './usePrivateStorageRows';
const f=vi.hoisted(()=>({user:{id:'owner'} as {id:string}|null,sign:vi.fn()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:f.user})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}));
vi.mock('@/lib/privateStorageUrl',()=>({signPrivateStorageUrl:(...args:any[])=>f.sign(...args)}));
describe('signed attachment view isolation',()=>{
 beforeEach(()=>{f.user={id:'owner'};f.sign.mockReset();f.sign.mockResolvedValue('https://project.example/fresh')});
 it('hides legacy URL pending signing, deduplicates and never mutates persisted rows',async()=>{const rows=[{file_url:'private/a'},{file_url:'private/a'}];const {result}=renderHook(()=>usePrivateStorageRows(rows,'file_url','chat-files'));expect(result.current[0].file_url).toBeNull();await waitFor(()=>expect(result.current[0].file_url).toContain('/fresh'));expect(f.sign).toHaveBeenCalledTimes(1);expect(rows[0].file_url).toBe('private/a')});
 it('denies without fallback and clears an old identity immediately',async()=>{const rows=[{file_url:'public/old'}];const {result,rerender}=renderHook(()=>usePrivateStorageRows(rows,'file_url','support-files'));await waitFor(()=>expect(result.current[0].file_url).toContain('/fresh'));f.user=null;rerender();expect(result.current[0].file_url).toBeNull()});
 it('does not expose expired or public references after signing fails',async()=>{f.sign.mockRejectedValue(Error('denied'));const rows=[{file_url:'https://project.example/old?token=expired'}];const {result}=renderHook(()=>usePrivateStorageRows(rows,'file_url','support-files'));await act(async()=>{await Promise.resolve()});expect(result.current[0].file_url).toBeNull()});
});
