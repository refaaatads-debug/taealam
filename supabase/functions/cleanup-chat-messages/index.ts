import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0?bundle";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "غير مصرح" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase.rpc("cleanup_old_chat_messages");

  if (error) {
    console.error("cleanup-chat-messages error:", error);
    return new Response(JSON.stringify({ error: "تعذر تنظيف الرسائل القديمة" }), { status: 500 });
  }

  return new Response(JSON.stringify({ deleted: data }), {
    headers: { "Content-Type": "application/json" },
  });
});
