export type DailyVoiceConfig = { enabled: boolean; agentId: string; versionId: string };
export async function loadDailyVoiceConfig(): Promise<DailyVoiceConfig> {
 try {
  const value=JSON.parse(await Deno.readTextFile(new URL('./live-voice-cap-config.json',import.meta.url)));
  if(value.enabled!==true || typeof value.agentId!=='string' || typeof value.versionId!=='string')
   return {enabled:false,agentId:'',versionId:''};
  return {enabled:true,agentId:value.agentId,versionId:value.versionId};
 } catch {return {enabled:false,agentId:'',versionId:''};}
}
