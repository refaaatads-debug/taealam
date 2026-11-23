import config from './live-voice-cap-config.json' with { type: 'json' };
export type DailyVoiceConfig = { enabled: boolean; agentId: string; versionId: string };
export async function loadDailyVoiceConfig(): Promise<DailyVoiceConfig> {
 try {
  const value: unknown = config;
  if(!value || typeof value!=='object') return {enabled:false,agentId:'',versionId:''};
  const c=value as Record<string,unknown>;
  if(c.enabled!==true || typeof c.agentId!=='string' || !c.agentId || typeof c.versionId!=='string' || !c.versionId)
   return {enabled:false,agentId:'',versionId:''};
  return {enabled:true,agentId:c.agentId,versionId:c.versionId};
 } catch {return {enabled:false,agentId:'',versionId:''};}
}
