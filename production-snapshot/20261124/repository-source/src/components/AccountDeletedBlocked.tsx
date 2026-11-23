import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageCircle, Trash2 } from "lucide-react";

const AccountDeletedBlocked = () => (
  <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4" dir="rtl">
    <div className="max-w-md w-full bg-card rounded-2xl shadow-card p-8 text-center space-y-5">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
        <Trash2 className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-black text-foreground">تم حذف الحساب من قبل الإدارة</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          لا يمكنك الوصول إلى الحساب حاليًا لأن الإدارة قامت بحذفه. إذا كنت تعتقد أن ذلك حدث بالخطأ، تواصل مع خدمة العملاء للمراجعة.
        </p>
      </div>
      <Button asChild className="w-full rounded-xl gap-2">
        <Link to="/support">
          <MessageCircle className="h-4 w-4" />
          التواصل مع خدمة العملاء
        </Link>
      </Button>
    </div>
  </div>
);

export default AccountDeletedBlocked;
