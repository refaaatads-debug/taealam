import { GraduationCap, Mail, Phone, MapPin, Twitter, Linkedin, Youtube, Instagram, ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const Footer = () => {
  const { getSetting } = useSiteSettings("footer");
  const headerSettings = useSiteSettings("header");

  const siteName = headerSettings.getSetting("site_name", "منصة أجيال المعرفة");
  const logoUrl = headerSettings.getSetting("header_logo", "");
  const description = getSetting(
    "footer_description",
    "منصة تعليمية ذكية تربط الطلاب بأفضل المدرسين في السعودية والوطن العربي، مدعومة بالذكاء الاصطناعي."
  );
  const email = getSetting("footer_email", "info@taallam.com");
  const phone = getSetting("footer_phone", "+966 50 000 0000");
  const address = getSetting("footer_address", "الرياض، المملكة العربية السعودية");
  const copyright = getSetting("footer_copyright", "© 2026 منصة أجيال المعرفة. جميع الحقوق محفوظة.");
  const madeWith = getSetting("footer_made_with", "صُنع بـ ❤️ في السعودية");
  const twitterUrl = getSetting("footer_twitter_url", "");
  const linkedinUrl = getSetting("footer_linkedin_url", "");
  const youtubeUrl = getSetting("footer_youtube_url", "");
  const instagramUrl = getSetting("footer_instagram_url", "");

  const socialLinks = [
    { Icon: Twitter, url: twitterUrl, label: "X / Twitter" },
    { Icon: Linkedin, url: linkedinUrl, label: "LinkedIn" },
    { Icon: Youtube, url: youtubeUrl, label: "YouTube" },
    { Icon: Instagram, url: instagramUrl, label: "Instagram" },
  ];

  return (
    <footer className="bg-foreground text-background relative overflow-hidden">
      {/* Decorative top gradient */}
      <div className="absolute inset-x-0 top-0 h-1 gradient-cta" />

      {/* CTA strip */}
      <div className="border-b border-background/10">
        <div className="container py-8 flex flex-col md:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-3 text-center md:text-right">
            <div className="hidden md:flex w-12 h-12 rounded-2xl bg-gold/15 items-center justify-center">
              <Sparkles className="h-6 w-6 text-gold" />
            </div>
            <div>
              <h4 className="font-black text-lg mb-1">انضم لطاقم المدرسين</h4>
              <p className="text-sm opacity-70">كن مديراً لوقتك ودخلك. ابدأ التدريس أونلاين اليوم.</p>
            </div>
          </div>
          <Link
            to="/teach-with-us"
            className="inline-flex items-center gap-2 gradient-cta text-secondary-foreground font-bold px-6 py-3 rounded-2xl shadow-button hover:scale-[1.02] transition-transform"
          >
            قدّم طلبك مجاناً
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="container py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              {logoUrl ? (
                <img src={logoUrl} alt={siteName} className="h-10 w-10 rounded-xl object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-xl gradient-cta flex items-center justify-center">
                  <GraduationCap className="h-5 w-5 text-secondary-foreground" />
                </div>
              )}
              <span className="font-extrabold text-xl">{siteName}</span>
            </div>
            <p className="text-sm opacity-70 leading-relaxed mb-5">{description}</p>

            <div className="inline-flex items-center gap-2 bg-background/10 rounded-full px-3 py-1.5 text-xs mb-5">
              <ShieldCheck className="h-3.5 w-3.5 text-gold" />
              <span className="opacity-80">منصة موثوقة • دفع آمن</span>
            </div>

            <div className="flex gap-2.5">
              {socialLinks.map((s, i) =>
                s.url ? (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="w-10 h-10 rounded-xl bg-background/10 hover:bg-gold/20 hover:text-gold flex items-center justify-center transition-all hover:-translate-y-0.5"
                  >
                    <s.Icon className="h-4 w-4" />
                  </a>
                ) : (
                  <div
                    key={i}
                    aria-label={s.label}
                    className="w-10 h-10 rounded-xl bg-background/5 flex items-center justify-center opacity-40"
                  >
                    <s.Icon className="h-4 w-4" />
                  </div>
                )
              )}
            </div>
          </div>

          {/* Platform */}
          <div>
            <h4 className="font-black mb-4 text-base flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-gold" />
              المنصة
            </h4>
            <ul className="flex flex-col gap-3 text-sm opacity-75">
              <li><Link to="/search" className="hover:opacity-100 hover:text-gold transition-colors">ابحث عن مدرس</Link></li>
              <li><Link to="/pricing" className="hover:opacity-100 hover:text-gold transition-colors">الباقات والأسعار</Link></li>
              <li><Link to="/teach-with-us" className="hover:opacity-100 hover:text-gold transition-colors">انضم كمعلم</Link></li>
              <li><Link to="/ai-tutor" className="hover:opacity-100 hover:text-gold transition-colors">المدرس الذكي AI</Link></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-black mb-4 text-base flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-gold" />
              الدعم
            </h4>
            <ul className="flex flex-col gap-3 text-sm opacity-75">
              <li><Link to="/faq" className="hover:opacity-100 hover:text-gold transition-colors">الأسئلة الشائعة</Link></li>
              <li><Link to="/privacy" className="hover:opacity-100 hover:text-gold transition-colors">سياسة الخصوصية</Link></li>
              <li><Link to="/terms" className="hover:opacity-100 hover:text-gold transition-colors">الشروط والأحكام</Link></li>
              <li><Link to="/refund" className="hover:opacity-100 hover:text-gold transition-colors">سياسة الاسترجاع</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-black mb-4 text-base flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-gold" />
              تواصل معنا
            </h4>
            <ul className="flex flex-col gap-3.5 text-sm opacity-75">
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-background/10 flex items-center justify-center flex-shrink-0">
                  <Mail className="h-4 w-4" />
                </div>
                <a href={`mailto:${email}`} dir="ltr" className="hover:opacity-100 hover:text-gold transition-colors mt-1">
                  {email}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-background/10 flex items-center justify-center flex-shrink-0">
                  <Phone className="h-4 w-4" />
                </div>
                <a href={`tel:${phone}`} dir="ltr" className="hover:opacity-100 hover:text-gold transition-colors mt-1">
                  {phone}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-background/10 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-4 w-4" />
                </div>
                <span className="mt-1">{address}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-background/10 mt-12 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-sm opacity-60">
          <span>{copyright}</span>
          <span>{madeWith}</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
