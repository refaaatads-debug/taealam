import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

interface Props {
  bookingId: string;
  existingReport?: string | null;
}

export default function SessionReport({ bookingId, existingReport }: Props) {
  const [report, setReport] = useState(existingReport || "");
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("session-report", {
        body: { booking_id: bookingId },
      });
      if (error) throw error;
      setReport(data.report || "");
    } catch {
      setReport("تعذر إنشاء التقرير. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 font-bold">
          <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-secondary" />
          </div>
          تقرير الحصة
          <Sparkles className="h-4 w-4 text-gold" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {report ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-sm text-foreground whitespace-pre-wrap text-sm leading-relaxed bg-accent/30 rounded-2xl p-4">
            {report}
          </motion.div>
        ) : (
          <div className="text-center py-6">
            <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">أنشئ تقرير ذكي عن هذه الحصة</p>
            <Button onClick={generateReport} disabled={loading} className="gradient-cta text-secondary-foreground rounded-xl shadow-button">
              {loading ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> جاري الإنشاء...</>
              ) : (
                <><Sparkles className="h-4 w-4 ml-2" /> إنشاء تقرير AI</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
