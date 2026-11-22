import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PublicPageHeader from "@/components/PublicPageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const DeleteAccount = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "pending" | "error">("idle");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      setEmail(u.email ?? null);
      const { data: existing } = await (supabase as any)
        .from("account_deletion_requests").select("id").eq("user_id", u.id).eq("status", "pending").limit(1);
      if (existing && existing.length) setStatus("pending");
    });
  }, []);

  const submit = async () => {
    if (!userId) return;
    setStatus("sending");
    const { error } = await (supabase as any)
      .from("account_deletion_requests").insert({ user_id: userId, email, reason: reason.trim() || null });
    setStatus(error ? "error" : "sent");
  };

  return (
    <div className="min-h-screen bg-background text-[#102f50]" dir="rtl">
      <Navbar />
      <PublicPageHeader icon={Trash2} eyebrow="بياناتك بيدك" title="طلب حذف الحساب" description="اطلب حذف حسابك وبياناتك من منصة أجيال المعرفة" />
      <main className="container max-w-3xl py-14 space-y-6">
        <section className="bg-card rounded-2xl border shadow-sm p-6 space-y-3 text-sm text-muted-foreground leading-relaxed">
          <h2 className="text-lg font-bold text-foreground">كيف يعمل الطلب</h2>
          <ul className="list-disc mr-5 space-y-1.5">
            <li>سجّل الدخول بحسابك المراد حذفه ثم أرسل الطلب من هذه الصفحة، أو من التطبيق: الحساب ثم «حذف حسابي».</li>
            <li>تراجع الإدارة الطلب وتؤكد الحذف، وقد نتواصل معك للتحقق من هويتك.</li>
            <li>عند الحذف نزيل بياناتك الشخصية: الاسم والبريد والهاتف والصورة والرسائل وملفاتك المرفوعة.</li>
            <li>قد نحتفظ لفترة محدودة بسجلات الحجوزات والمدفوعات والفواتير بالقدر الذي يفرضه النظام أو يلزم لحل النزاعات، بعد إزالة ما يدل على هويتك قدر الإمكان.</li>
            <li>تسجيلات الجلسات تُحذف تلقائيًا بعد 7 أيام من انتهاء الجلسة.</li>
            <li>الحذف نهائي ولا يمكن التراجع عنه، وتُفقد الدقائق المتبقية في الباقة.</li>
          </ul>
        </section>
        <section className="bg-card rounded-2xl border shadow-sm p-6 space-y-4">
          {!userId ? (
            <p className="text-sm">لإرسال الطلب يجب تسجيل الدخول أولًا. <Link to="/login" className="text-primary font-bold underline">تسجيل الدخول</Link></p>
          ) : status === "sent" || status === "pending" ? (
            <p className="text-sm font-bold text-foreground">{status === "sent" ? "تم استلام طلبك وسيتم مراجعته." : "لديك طلب حذف قيد المراجعة."}</p>
          ) : (
            <>
              <p className="text-sm">الحساب: <span dir="ltr" className="font-bold">{email}</span></p>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder="سبب الحذف (اختياري)" className="w-full rounded-xl border p-3 text-sm bg-background" />
              <Button onClick={submit} disabled={status === "sending"} variant="destructive">إرسال طلب حذف حسابي</Button>
              {status === "error" && <p className="text-sm text-red-600">تعذر إرسال الطلب، حاول مرة أخرى.</p>}
            </>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default DeleteAccount;
