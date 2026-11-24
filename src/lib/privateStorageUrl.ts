export type SensitiveBucket = 'chat-files' | 'support-files';
export const SIGNED_ATTACHMENT_SECONDS = 300;
/** Accept only this project's sensitive objects. Never trust a stored host/token. */
export function privateStorageObject(value: string, baseUrl: string, fallback?: SensitiveBucket): {bucket: SensitiveBucket; path: string} | null {
  const raw=value.trim();
  if (!raw || /[\u0000-\u001f\\]/.test(raw)) throw Error('Invalid attachment reference');
  let path=raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) {
    const url=new URL(raw,baseUrl),base=new URL(baseUrl);
    if(url.origin!==base.origin || url.username || url.password) throw Error('Untrusted attachment origin');
    path=url.pathname;
  } else path=raw.split(/[?#]/,1)[0];
  const match=path.match(/^\/?storage\/v1\/object\/(?:public|sign|authenticated)\/(chat-files|support-files)\/(.+)$/i)
    || path.match(/^\/?(chat-files|support-files)\/(.+)$/i);
  if(match) {fallback=match[1].toLowerCase() as SensitiveBucket;path=match[2];}
  else if (!fallback || /^\/?storage\//.test(path)) throw Error('Unsupported attachment bucket');
  else path=path.replace(/^\/+/, '');
  try {path=decodeURIComponent(path);} catch {throw Error('Invalid attachment encoding');}
  if(!path || path.split('/').some(x=>!x || x==='.' || x==='..') || /[\u0000-\u001f\\]/.test(path) || /%2[ef]|%5c/i.test(path)) throw Error('Invalid attachment path');
  return {bucket:fallback!,path};
}
export async function signPrivateStorageUrl(client:any,value:string,baseUrl:string,fallback?:SensitiveBucket):Promise<string> {
  const object=privateStorageObject(value,baseUrl,fallback);
  if(!object) throw Error('Invalid attachment');
  const {data,error}=await client.storage.from(object.bucket).createSignedUrl(object.path,SIGNED_ATTACHMENT_SECONDS);
  if(error || !data?.signedUrl) throw Error('Attachment access unavailable');
  const url=new URL(data.signedUrl,baseUrl);
  if(url.origin!==new URL(baseUrl).origin || !url.pathname.startsWith(`/storage/v1/object/sign/${object.bucket}/`)) throw Error('Invalid signed attachment URL');
  return url.href;
}
