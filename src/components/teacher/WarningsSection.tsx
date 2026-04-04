import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function WarningsSection() {
  const { user } = useAuth();
  const [warnings, setWarnings] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("user_warnings")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setWarnings(data || []);
    };
    fetch();
  }, [user]);

  if (warnings.length === 0) return null;

  return (
    <Card className="border-0 shadow-card border-destructive/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </div>
          التحذيرات والمخالفات
          <Badge className="mr-auto bg-destructive/10 text-destructive border-0 text-xs">{warnings.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {warnings.map((w) => (
          <div key={w.id} className="flex items-start gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-sm text-foreground">
                  {w.warning_type === "chat_violation" ? "مخالفة محادثة" : w.warning_type}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(w.created_at).toLocaleDateString("ar-SA")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{w.description || "مخالفة لسياسات المنصة"}</p>
              {w.is_banned && (
                <Badge variant="destructive" className="mt-2 text-[10px]">
                  محظور حتى {w.banned_until ? new Date(w.banned_until).toLocaleDateString("ar-SA") : "إشعار آخر"}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
