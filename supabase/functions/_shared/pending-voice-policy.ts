// OFF-PRODUCTION policy comparison. Neither variant is activated.
export const pendingVoicePolicies = {
 conservative300: {providerMaxSeconds:300,heldSeconds:301,closingToleranceSeconds:1},
 conservative299: {providerMaxSeconds:299,heldSeconds:300,closingToleranceSeconds:1},
} as const;
export function preciseProviderVoiceSeconds(call: {metadata?: {charging?: {platform_usage?: {category_usage?: {voice?: {quantity?:unknown}}}}}}):number {
 const minutes=call.metadata?.charging?.platform_usage?.category_usage?.voice?.quantity;
 if(typeof minutes!=='number'||!Number.isFinite(minutes)||minutes<0||minutes>60)throw Error('invalid_voice_quantity');
 // The provider's voice quantity is minutes. Preserve conservative whole seconds.
 return Math.ceil(minutes*60);
}
export function fullSessionsLeft(remaining:number,policy:keyof typeof pendingVoicePolicies){
 return Math.floor(remaining/pendingVoicePolicies[policy].heldSeconds);
}
