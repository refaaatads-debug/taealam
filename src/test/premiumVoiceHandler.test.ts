import {describe,it,expect,vi} from 'vitest';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {shouldGenerateTutorAudio} from '../../supabase/functions/_shared/premium-voice';
const filename=process.cwd()+'/supabase/functions/ai-tutor-chat/index.ts';
const source=readFileSync(filename,'utf8').split('\n').filter(l=>!l.startsWith('import ')).join('\n').replace(/return withTimeout\(inner, 25_000, TIMEOUT_RESP\)/,'return inner');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function request(tier:string,speak:unknown,options:{auth?:boolean;dbError?:boolean;active?:boolean;minutes?:number}={}){
 let handler:(r:Request)=>Promise<Response>;
 const provider=vi.fn(async(url:string)=>{
  if(url.includes('groq.com'))return new Response(JSON.stringify({choices:[{message:{content:'Text answer'}}]}));
  if(url.includes('text-to-speech'))return new Response(new Uint8Array([1,2,3]));
  throw new Error('unexpected upstream');
 });
 const client={auth:{getUser:async()=>({data:{user:options.auth===false?null:{id:'server-user'}},error:null})},from:(table:string)=>({select:()=>({eq:(_key:string,id:string)=>{
  if(table==='user_subscriptions'){expect(id).toBe('server-user');return Promise.resolve({data:[{is_active:options.active!==false,remaining_minutes:options.minutes??30,subscription_plans:{tier}}],error:options.dbError?{message:'unavailable'}:null});}
  return {maybeSingle:async()=>({data:{value:'test-voice'}})};
 }})})};
 runInNewContext(js,{serve:(h:typeof handler)=>{handler=h;},createClient:()=>client,shouldGenerateTutorAudio,getCorsHeaders:()=>({}),checkEdgeRateLimit:()=>({allowed:true}),getProviderApiKey:async()=> 'test',getGroqModels:async()=>['test-model'],getGeminiModel:async()=> 'test',base64Encode:()=> 'encoded-audio',fetch:provider,Request,Response,Headers,Uint8Array,console:{log(){},error(){},warn(){}},setTimeout:()=>0,Deno:{env:{get:()=> 'test'}}});
 const result=await handler!(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Question'}],...(speak===undefined?{}:{speak})})}));
 return {result,body:await result.json(),provider};
}
describe('actual tutor edge handler with mocked paid providers',()=>{
 for(const tier of ['free','standard','basic'])it(`${tier} gets text but no TTS even when requesting audio`,async()=>{
  const {result,body,provider}=await request(tier,true);expect(result.status).toBe(200);expect(body.text).toBe('Text answer');expect(body.audio).toBeNull();expect(provider.mock.calls.filter(x=>String(x[0]).includes('text-to-speech'))).toHaveLength(0);
 });
 it('premium gets audio',async()=>{const{body,provider}=await request('premium',true);expect(body.audio).toBe('encoded-audio');expect(provider.mock.calls).toHaveLength(2);});
 it('explicit text-only premium remains text-only',async()=>{const{body,provider}=await request('premium',false);expect(body.audio).toBeNull();expect(provider.mock.calls).toHaveLength(1);});
 it('entitlement DB failure cannot generate audio or break text',async()=>{const{body,provider}=await request('premium',true,{dbError:true});expect(body.text).toBe('Text answer');expect(body.audio).toBeNull();expect(provider.mock.calls).toHaveLength(1);});
 it('missing speak cannot bypass gate',async()=>{const{body}=await request('free',undefined);expect(body.audio).toBeNull();expect(body.text).toBe('Text answer');});
 it('unauthenticated user invokes no paid provider',async()=>{const{result,provider}=await request('premium',true,{auth:false});expect(result.status).toBe(401);expect(provider.mock.calls).toHaveLength(0);});
 it('inactive and zero-balance premium receive text without audio',async()=>{for(const o of [{active:false},{minutes:0}]){const{body}=await request('premium',true,o);expect(body.text).toBe('Text answer');expect(body.audio).toBeNull();}});
});
