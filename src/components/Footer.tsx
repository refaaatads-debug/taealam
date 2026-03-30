import { GraduationCap, Mail, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="bg-foreground text-background">
    <div className="container py-16">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl gradient-cta flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-secondary-foreground" />
            </div>
            <span className="font-extrabold text-xl">تعلّم</span>
          </div>
          <p className="text-sm opacity-70 leading-relaxed mb-6">
            منصة تعليمية ذكية تربط الطلاب بأفضل المدرسين في السعودية والوطن العربي، مدعومة بالذكاء الاصطناعي.
          </p>
          <div className="flex gap-3">
            {["𝕏", "in", "▶"].map((icon, i) => (
              <div key={i} className="w-9 h-9 rounded-xl bg-background/10 hover:bg-background/20 flex items-center justify-center cursor-pointer transition-colors text-xs font-bold">
                {icon}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h4 className="font-bold mb-4 text-base">المنصة</h4>
          <div className="flex flex-col gap-3 text-sm opacity-70">
            <Link to="/search" className="hover:opacity-100 transition-opacity">ابحث عن مدرس</Link>
            <Link to="/student" className="hover:opacity-100 transition-opacity">لوحة الطالب</Link>
            <Link to="/teacher" className="hover:opacity-100 transition-opacity">سجّل كمعلم</Link>
            <Link to="/ai-tutor" className="hover:opacity-100 transition-opacity">المدرس الذكي AI</Link>
          </div>
        </div>
        <div>
          <h4 className="font-bold mb-4 text-base">الدعم</h4>
          <div className="flex flex-col gap-3 text-sm opacity-70">
            <span className="cursor-pointer hover:opacity-100 transition-opacity">الأسئلة الشائعة</span>
            <span className="cursor-pointer hover:opacity-100 transition-opacity">سياسة الخصوصية</span>
            <span className="cursor-pointer hover:opacity-100 transition-opacity">الشروط والأحكام</span>
            <span className="cursor-pointer hover:opacity-100 transition-opacity">سياسة الاسترجاع</span>
          </div>
        </div>
        <div>
          <h4 className="font-bold mb-4 text-base">تواصل معنا</h4>
          <div className="flex flex-col gap-3 text-sm opacity-70">
            <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> info@taallam.com</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> +966 50 000 0000</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> الرياض، المملكة العربية السعودية</div>
          </div>
        </div>
      </div>
      <div className="border-t border-background/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between text-sm opacity-50">
        <span>© 2026 تعلّم. جميع الحقوق محفوظة.</span>
        <span>صُنع بـ ❤️ في السعودية</span>
      </div>
    </div>
  </footer>
);

export default Footer;
