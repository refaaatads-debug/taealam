import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, GraduationCap, User, Search, LogOut, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import brandLogo from "@/assets/logo.png";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, roles, signOut } = useAuth();
  const { getSetting } = useSiteSettings("header");

  const loginText = getSetting("header_login_text", "تسجيل الدخول");
  const ctaText = getSetting("header_cta_text", "ابدأ معنا");

  useEffect(() => {
    let ticking = false;
    let lastScrolled = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const next = window.scrollY > 20;
        if (next !== lastScrolled) {
          lastScrolled = next;
          setScrolled(next);
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isAdmin = roles.includes("admin");
  const isTeacher = roles.includes("teacher");
  const isStudent = roles.includes("student");

  const links = [
    ...(!isStudent && !isTeacher ? [{ label: "الرئيسية", to: "/" }] : []),
    ...(!isAdmin && !isTeacher ? [{ label: "ابحث عن مدرس", to: "/search" }] : []),
    ...(!user ? [{ label: "الباقات", to: "/pricing" }] : []),
    ...(isStudent ? [{ label: "الباقات", to: "/pricing" }] : []),
    ...(user ? [
      ...(isAdmin
        ? [{ label: "لوحة التحكم", to: "/admin" }]
        : [
            ...(isStudent ? [{ label: "لوحة الطالب", to: "/student" }] : []),
            ...(isTeacher ? [{ label: "لوحة المعلم", to: "/teacher" }] : []),
          ]
      ),
    ] : []),
  ];

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <nav dir="rtl" className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "border-b border-[#102f50]/10 bg-white/95 shadow-[0_8px_30px_-18px_rgba(16,47,80,0.35)] backdrop-blur-xl" : "border-b border-[#102f50]/[0.06] bg-white/90 backdrop-blur-md"}`}>
      <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
        <Link
          to={isAdmin ? "/admin" : isTeacher ? "/teacher" : isStudent ? "/student" : "/"}
          className="flex items-center gap-2.5 group"
          title={BRAND_NAME}
        >
          <motion.img
            whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
            transition={{ duration: 0.5 }}
            src={brandLogo}
            alt={BRAND_NAME}
            className="h-9 w-9 object-contain md:h-10 md:w-10"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-black tracking-tight text-[#102f50] md:text-base">{BRAND_NAME}</span>
            <span className="hidden text-[8px] font-bold tracking-[0.18em] text-[#188779] sm:block md:text-[9px]">{BRAND_TAGLINE}</span>
          </div>
        </Link>

        <div className="hidden items-center gap-1 rounded-full border border-[#102f50]/10 bg-[#f7f9f8] p-1 md:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to}
              className={`relative rounded-full px-4 py-2 text-xs font-black transition-all duration-300 md:px-5 ${isActive(l.to) ? "text-white" : "text-[#102f50]/60 hover:text-[#102f50]"}`}>
              {isActive(l.to) && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-[#188779] shadow-md shadow-[#188779]/20"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{l.label}</span>
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-1.5 md:flex">
          {!isAdmin && !isTeacher && (
            <Button variant="ghost" size="icon" className="rounded-xl text-[#102f50]/65 hover:bg-[#e8f1ef] hover:text-[#188779]" asChild>
              <Link to="/search"><Search className="h-4 w-4" /></Link>
            </Button>
          )}
          <NotificationBell />
          {user ? (
            <>
              <Button variant="ghost" size="icon" className="rounded-xl text-[#102f50]/65 hover:bg-[#e8f1ef] hover:text-[#188779]" asChild>
                <Link to="/profile"><User className="h-4 w-4" /></Link>
              </Button>
              <span className="max-w-28 truncate text-xs font-bold text-[#102f50]">{profile?.full_name || "المستخدم"}</span>
              <Button variant="ghost" size="icon" className="rounded-xl text-[#102f50]/50 hover:bg-red-50 hover:text-red-600" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="gap-2 rounded-xl border border-[#188779]/30 bg-[#f7f9f8] text-xs font-black text-[#188779] transition-all hover:border-[#188779] hover:bg-[#e8f1ef]"
                asChild
              >
                <Link to="/teach-with-us">
                  <Sparkles className="h-4 w-4" />
                  انضم لطاقم المدرسين
                </Link>
              </Button>
              <Button variant="ghost" className="rounded-xl text-xs font-black text-[#102f50]/70 hover:bg-[#f7f9f8] hover:text-[#102f50]" asChild>
                <Link to="/login">{loginText}</Link>
              </Button>
              <Button className="rounded-xl bg-[#188779] px-5 text-xs font-black text-white shadow-lg shadow-[#188779]/20 transition-all hover:-translate-y-0.5 hover:bg-[#147568]" asChild>
                <Link to="/login">{ctaText}</Link>
              </Button>
            </>
          )}
        </div>

        <button aria-label={open ? "إغلاق القائمة" : "فتح القائمة"} className="rounded-xl p-2 text-[#102f50] transition-colors hover:bg-[#f7f9f8] md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden border-t border-[#102f50]/10 bg-white md:hidden">
            <div className="container py-4 flex flex-col gap-1">
              {links.map((l, i) => (
                <motion.div key={l.to} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link to={l.to} className={`block rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${isActive(l.to) ? "bg-[#e8f1ef] text-[#188779]" : "text-[#102f50]/65 hover:bg-[#f7f9f8]"}`} onClick={() => setOpen(false)}>
                    {l.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-[#102f50]/10 pt-3">
                {user ? (
                  <Button variant="outline" className="w-full rounded-xl border-[#102f50]/15" onClick={handleSignOut}>تسجيل الخروج</Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="w-full gap-2 rounded-xl border-[#188779]/30 font-bold text-[#188779] hover:bg-[#e8f1ef]"
                      asChild
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/teach-with-us">
                        <Sparkles className="h-4 w-4" />
                        انضم لطاقم المدرسين
                      </Link>
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 rounded-xl border-[#102f50]/15" asChild onClick={() => setOpen(false)}><Link to="/login">{loginText}</Link></Button>
                      <Button className="flex-1 rounded-xl bg-[#188779] font-bold text-white hover:bg-[#147568]" asChild onClick={() => setOpen(false)}><Link to="/login">{ctaText}</Link></Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
