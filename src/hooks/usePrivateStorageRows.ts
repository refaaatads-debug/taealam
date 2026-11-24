import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { signPrivateStorageUrl, type SensitiveBucket } from '@/lib/privateStorageUrl';
/** Resolve only for the current identity. No persistent/global signed-URL cache. */
export function usePrivateStorageRows<T extends Record<string,any>>(rows:T[],field:string,bucket:SensitiveBucket):T[] {
 const {user}=useAuth();
 const [result,setResult]=useState<{rows:T[];userId:string;values:T[]} | null>(null);
 useEffect(()=>{
  let active=true;
  async function refresh(){
   const values=rows.map(row=>({...row,[field]:null}));let next=0;
   const seen=new Map<string,Promise<string>>();
   await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{
    while(next<rows.length){const i=next++;const value=rows[i][field];if(!value || !user)continue;
     try{if(!seen.has(value))seen.set(value,signPrivateStorageUrl(supabase,value,import.meta.env.VITE_SUPABASE_URL,bucket));values[i]={...rows[i],[field]:await seen.get(value)};}catch{/* Denial never falls back to public/old signed URLs. */}
    }
   }));
   if(active && user)setResult({rows,userId:user.id,values});
  }
  void refresh();const timer=setInterval(()=>void refresh(),240000);
  return()=>{active=false;clearInterval(timer)};
 },[rows,field,bucket,user?.id]);
 return result?.rows===rows && result.userId===user?.id?result.values:rows.map(row=>({...row,[field]:null}));
}
