// Strict MPEG1 LayerIII CBR parser for the EXISTING mp3_44100_128 provider format.
// Counts full frame samples, including encoder padding, conservatively rounded up.
// Unsupported/malformed audio is never returned or refunded based on guessed duration.
export function providerMp3Seconds(bytes: Uint8Array): number {
 let at=0;
 if(bytes.length>=10 && String.fromCharCode(...bytes.slice(0,3))==='ID3') {
  const sizes=bytes.slice(6,10);
  if(sizes.some(n=>n>127)) throw Error('invalid_id3');
  const size=((sizes[0]<<21)|(sizes[1]<<14)|(sizes[2]<<7)|sizes[3]);
  at=10+size+((bytes[5]&16)?10:0);
 }
 let frames=0;
 while(at<bytes.length){
  if(bytes.length-at===128 && String.fromCharCode(...bytes.slice(at,at+3))==='TAG') {at+=128;break;}
  if(at+4>bytes.length)throw Error('truncated_mp3');
  const a=bytes[at],b=bytes[at+1],c=bytes[at+2],d=bytes[at+3];
  if(a!==255 || (b&0xfe)!==0xfa || (c>>4)!==9 || ((c>>2)&3)!==0 || (d>>6)===3) throw Error('unsupported_mp3');
  const frameLength=Math.floor(144*128000/44100)+((c>>1)&1);
  if(at+frameLength>bytes.length)throw Error('truncated_mp3');
  at+=frameLength;frames++;
 }
 if(!frames || at!==bytes.length)throw Error('invalid_mp3');
 return Math.ceil(frames*1152/44100);
}

export async function generateBudgetedTts(deps:{
 userId:string; reserve:(id:string)=>Promise<any>; bind:(id:string,operationId:string)=>Promise<boolean>;
 generate:()=>Promise<Uint8Array>; settle:(operationId:string,seconds:number)=>Promise<any>;
 operationId:string;
}) {
 const hold=await deps.reserve(deps.userId);
 if(!hold.allowed)return {audio:null,reason:hold.reason};
 if(!Number.isInteger(hold.max_seconds)||hold.max_seconds<1||hold.max_seconds>300)throw Error('unsafe_hold');
 if(!deps.operationId.startsWith('tts_') || !await deps.bind(hold.reservation_id,deps.operationId))throw Error('binding_failed');
 // Provider charge may occur even when an ambiguous generation fails. Keep hold.
 const audio=await deps.generate();
 const seconds=providerMp3Seconds(audio);
 const result=await deps.settle(deps.operationId,seconds);
 if(!result?.ok)throw Error('settlement_failed');
 if(seconds>hold.max_seconds || result.provider_overrun)return {audio:null,reason:'audio_exceeds_budget',seconds};
 return {audio,seconds};
}
