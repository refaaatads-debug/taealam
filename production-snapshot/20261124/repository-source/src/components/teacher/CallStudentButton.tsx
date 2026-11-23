import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PhoneCallDialog from "./PhoneCallDialog";

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
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState<string>();
  const [studentPhone, setStudentPhone] = useState<string>();

  useEffect(() => {
    if (!open || !bookingId) return;
    (async () => {
      const { data: booking } = await supabase
        .from("bookings")
        .select("student_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (booking?.student_id) {
        setStudentId(booking.student_id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone")
          .eq("user_id", booking.student_id)
          .maybeSingle();
        setStudentPhone(profile?.phone || "");
      }
    })();
  }, [open, bookingId]);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
        className={className}
        title="اتصل بالطالب (مدفوع)"
      >
        <Phone className="h-4 w-4" />
        {!iconOnly && <span className="mr-2">اتصل بالطالب</span>}
      </Button>
      <PhoneCallDialog
        open={open}
        onOpenChange={setOpen}
        bookingId={bookingId}
        studentId={studentId}
        studentPhone={studentPhone}
      />
    </>
  );
}
