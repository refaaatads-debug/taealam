import { GraduationCap, Mail, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const Footer = () => {
  const { getSetting } = useSiteSettings("footer");
  const headerSettings = useSiteSettings("header");

  const siteName = headerSettings.getSetting("site_name", "منصة أجيال المعرفة");
  const logoUrl = headerSettings.getSetting("header_logo", "");
  const description = getSetting("footer_description", "منصة تعليمية ذكية تربط الطلاب بأفضل المدرسين في السعودية والوطن العربي، مدعومة بالذكاء الاصطناعي.");
  const email = getSetting("footer_email", "info@taallam.com");
  const phone = getSetting("footer_phone", "+966 50 000 0000");
  const address = getSetting("footer_address", "الرياض، المملكة العربية السعودية");
  const copyright = getSetting("footer_copyright", "© 2026 منصة أجيال المعرفة. جميع الحقوق محفوظة.");
  const madeWith = getSetting("footer_made_with", "صُنع بـ ❤️ في السعودية");
  const twitterUrl = getSetting("footer_twitter_url", "");
  const linkedinUrl = getSetting("footer_linkedin_url", "");
  const youtubeUrl = getSetting("footer_youtube_url", "");

  const socialLinks = [
    { label: "𝕏", url: twitterUrl },
    { label: "in", url: linkedinUrl },
    { label: "▶", url: youtubeUrl },
  ];

  return (
    <footer className="bg-foreground text-background">
      <div className="container py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              {logoUrl ? (
                <img src={logoUrl} alt={siteName} className="h-9 w-9 rounded-xl object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-xl gradient-cta flex items-center justify-center">
                  <GraduationCap className="h-5 w-5 text-secondary-foreground" />
                </div>
              )}
              <span className="font-extrabold text-xl">{siteName}</span>
            </div>
            <p className="text-sm opacity-70 leading-relaxed mb-6">{description}</p>
            <div className="flex gap-3">
              {socialLinks.map((s, i) => (
                s.url ? (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="w-9 h-9 rounded-xl bg-background/10 hover:bg-background/20 flex items-center justify-center cursor-pointer transition-colors text-xs font-bold">
                    {s.label}
                  </a>
                ) : (
                  <div key={i} className="w-9 h-9 rounded-xl bg-background/10 hover:bg-background/20 flex items-center justify-center cursor-pointer transition-colors text-xs font-bold">
                    {s.label}
                  </div>
                )
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
              <Link to="/faq" className="hover:opacity-100 transition-opacity">الأسئلة الشائعة</Link>
              <Link to="/privacy" className="hover:opacity-100 transition-opacity">سياسة الخصوصية</Link>
              <Link to="/terms" className="hover:opacity-100 transition-opacity">الشروط والأحكام</Link>
              <Link to="/refund" className="hover:opacity-100 transition-opacity">سياسة الاسترجاع</Link>
            </div>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-base">تواصل معنا</h4>
            <div className="flex flex-col gap-3 text-sm opacity-70">
              <div className="flex items-center gap-2"><Mail className="h-4 w-4" /> {email}</div>
              <div className="flex items-center gap-2"><Phone className="h-4 w-4" /> {phone}</div>
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {address}</div>
            </div>
          </div>
        </div>
        <div className="border-t border-background/10 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between text-sm opacity-50">
          <span>{copyright}</span>
          <span>{madeWith}</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
