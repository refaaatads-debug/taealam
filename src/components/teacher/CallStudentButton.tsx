import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CallStudentButtonProps {
  bookingId: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
  iconOnly?: boolean;
}

export default function CallStudentButton({
  bookingId,
  variant = "outline",
  size = "sm",
  className,
  iconOnly = false,
}: CallStudentButtonProps) {
  const [calling, setCalling] = useState(false);

  const handleCall = async () => {
    if (calling) return;
    setCalling(true);
    toast.loading("جارٍ الاتصال بالطالب...", { id: "twilio-call" });

    try {
      const { data, error } = await supabase.functions.invoke("twilio-call", {
        body: { bookingId },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل الاتصال");

      toast.success("تم بدء المكالمة بنجاح 📞", {
        id: "twilio-call",
        description: "هاتفك سيرن خلال ثوانٍ — أجب لتوصيلك بالطالب",
      });
    } catch (err: any) {
      console.error("Call failed:", err);
      toast.error("تعذّر بدء المكالمة", {
        id: "twilio-call",
        description: err?.message || "يرجى التأكد من توفر رقم هاتف الطالب",
      });
    } finally {
      setCalling(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCall}
      disabled={calling}
      className={className}
      title="اتصل بالطالب (مكالمة مخفية)"
    >
      {calling ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Phone className="h-4 w-4" />
      )}
      {!iconOnly && <span className="mr-2">{calling ? "جارٍ الاتصال..." : "اتصل بالطالب"}</span>}
    </Button>
  );
}
