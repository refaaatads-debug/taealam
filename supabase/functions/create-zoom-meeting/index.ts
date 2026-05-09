import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// This function is deprecated. The platform uses WebRTC P2P instead of Zoom.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ error: "Zoom integration is deprecated. Use WebRTC sessions instead." }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 410 }
  );
});
