import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="bg-primary text-primary-foreground">
    <div className="container py-12">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 font-bold text-lg mb-3">
            <GraduationCap className="h-6 w-6" />
            <span>تعلّم</span>
          </div>
          <p className="text-sm opacity-80">منصة تعليمية ذكية تربط الطلاب بأفضل المدرسين في الوطن العربي.</p>
        </div>
        <div>
          <h4 className="font-semibold mb-3">روابط سريعة</h4>
          <div className="flex flex-col gap-2 text-sm opacity-80">
            <Link to="/search" className="hover:opacity-100 transition-opacity">ابحث عن مدرس</Link>
            <Link to="/student" className="hover:opacity-100 transition-opacity">لوحة الطالب</Link>
            <Link to="/teacher" className="hover:opacity-100 transition-opacity">لوحة المعلم</Link>
          </div>
        </div>
        <div>
          <h4 className="font-semibold mb-3">الدعم</h4>
          <div className="flex flex-col gap-2 text-sm opacity-80">
            <span>الأسئلة الشائعة</span>
            <span>تواصل معنا</span>
            <span>سياسة الخصوصية</span>
          </div>
        </div>
        <div>
          <h4 className="font-semibold mb-3">تواصل معنا</h4>
          <p className="text-sm opacity-80">info@taallam.com</p>
          <p className="text-sm opacity-80">+966 50 000 0000</p>
        </div>
      </div>
      <div className="border-t border-primary-foreground/20 mt-8 pt-6 text-center text-sm opacity-60">
        © 2026 تعلّم. جميع الحقوق محفوظة.
      </div>
    </div>
  </footer>
);

export default Footer;
