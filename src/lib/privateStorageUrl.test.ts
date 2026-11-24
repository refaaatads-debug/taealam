import {describe,it,expect,vi} from 'vitest';
import {privateStorageObject,signPrivateStorageUrl} from './privateStorageUrl';
const base='https://project.example';
describe('private attachment references',()=>{
 for(const prefix of ['public','sign','authenticated'])it(`normalizes legacy ${prefix} URL without preserving token`,()=>{expect(privateStorageObject(`${base}/storage/v1/object/${prefix}/chat-files/booking/a%20b.pdf?token=old`,base)).toEqual({bucket:'chat-files',path:'booking/a b.pdf'})});
 it('accepts bare storage path with explicit expected bucket',()=>expect(privateStorageObject('owner/file.pdf',base,'support-files')).toEqual({bucket:'support-files',path:'owner/file.pdf'}));
 for(const value of ['https://evil.example/storage/v1/object/public/chat-files/b/a','//evil.example/a','javascript:alert(1)','chat-files/a/../b','chat-files/a/%2e%2e/b','chat-files/a/%252e%252e/b','chat-files/a%5cb','storage/v1/object/public/site-assets/a'])it(`rejects unsafe reference ${value}`,()=>expect(()=>privateStorageObject(value,base,'chat-files')).toThrow());
 it('signs through the current authenticated client with five minute expiry',async()=>{const sign=vi.fn(async()=>({data:{signedUrl:base+'/storage/v1/object/sign/chat-files/b/a?token=fresh'},error:null}));const c={storage:{from:vi.fn(()=>({createSignedUrl:sign}))}};expect(await signPrivateStorageUrl(c,base+'/storage/v1/object/public/chat-files/b/a',base)).toContain('token=fresh');expect(sign).toHaveBeenCalledWith('b/a',300)});
 it('never falls back to old public/signed URL on denial',async()=>{const c={storage:{from:()=>({createSignedUrl:async()=>({data:null,error:Error('denied')})})}};await expect(signPrivateStorageUrl(c,'chat-files/b/a',base)).rejects.toThrow('unavailable')});
});
