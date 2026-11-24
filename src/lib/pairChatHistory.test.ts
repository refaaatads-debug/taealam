import {describe,it,expect,vi} from 'vitest';
import {loadPairChatHistory} from './pairChatHistory';
describe('combined pair chat history',()=>{
 it('uses verified pair RPC and deduplicates booking ids',async()=>{
  const client={rpc:vi.fn(async(name:string)=>name==='get_pair_messages'?{data:[{id:'m'}],error:null}:{data:[{bid:'b'},{bid:'b'},{bid:'c'}],error:null}),from:vi.fn()};
  expect(await loadPairChatHistory(client,'b','s','t')).toEqual({messages:[{id:'m'}],bookingIds:['b','c']});expect(client.from).not.toHaveBeenCalled();
 });
 it('retains canonical pair filters and bounded message chunks if old backend has no RPC',async()=>{
  const batches:string[][]=[];const eq=vi.fn();const chain:any={select:()=>chain,eq:(k:string,v:string)=>{eq(k,v);return eq.mock.calls.length===2?Promise.resolve({data:Array.from({length:205},(_,i)=>({id:'b'+i})),error:null}):chain;}};
  const client={rpc:async()=>({error:{code:'PGRST202'},data:null}),from:(name:string)=>name==='bookings'?chain:{select:()=>({in:(_k:string,ids:string[])=>{batches.push(ids);return {gte:()=>({order:async()=>({data:[{id:String(batches.length),created_at:'2035-01-01'}],error:null})})};}})}};
  const result=await loadPairChatHistory(client,'b0','s','t');expect(eq.mock.calls).toEqual([['student_id','s'],['teacher_id','t']]);expect(batches.map(b=>b.length)).toEqual([100,100,5]);expect(result.bookingIds).toHaveLength(205);expect(result.messages).toHaveLength(3);
 });
 it('does not hide fallback query errors as empty history',async()=>{
  const error=Error('read failed');const c:any={rpc:async()=>({error}),from:()=>({select:()=>({eq:()=>({eq:async()=>({error})})})})};await expect(loadPairChatHistory(c,'b','s','t')).rejects.toThrow('read failed');
 });
});
