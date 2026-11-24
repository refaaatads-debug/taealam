import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageCircle, ShieldX } from "lucide-react";

const TeacherApprovalBlocked = () => (
  <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4" dir="rtl">
    <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8 text-center space-y-5">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
        <ShieldX className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-black text-foreground">تم رفض طلب اعتماد المعلم</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          لم تتم الموافقة على طلب اعتمادك حاليًا. يمكنك التواصل مع خدمة العملاء لطلب مراجعة القرار ومعرفة التفاصيل.
        </p>
      </div>
      <Button asChild className="w-full rounded-xl gap-2">
        <Link to="/support">
          <MessageCircle className="h-4 w-4" />
          إرسال رسالة إلى الدعم الفني
        </Link>
      </Button>
    </div>
  </div>
);

export default TeacherApprovalBlocked;
