import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, GraduationCap, User, Search, LogOut, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import brandLogo from "@/assets/logo.png";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, roles, signOut } = useAuth();
  const { getSetting, loading } = useSiteSettings("header");

  const siteName = getSetting("site_name", "منصة أجيال المعرفة");
  const loginText = getSetting("header_login_text", "تسجيل الدخول");
  const ctaText = getSetting("header_cta_text", "ابدأ مجاناً");
  const logoUrl = getSetting("header_logo", "");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
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
    <nav className={`sticky top-0 z-50 transition-all duration-500 ${scrolled ? "bg-card/85 backdrop-blur-2xl shadow-[0_4px_30px_-10px_hsl(var(--primary)/0.15)] border-b border-border/40" : "bg-card/40 backdrop-blur-md border-b border-transparent"}`}>
      <div className="container flex items-center justify-between h-16">
        <Link to={isAdmin ? "/admin" : isTeacher ? "/teacher" : isStudent ? "/student" : "/"} className="flex items-center gap-2.5 group">
          <motion.img
            whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
            transition={{ duration: 0.5 }}
            src={logoUrl || brandLogo}
            alt={siteName}
            className="h-10 w-10 object-contain"
          />
          <div className="flex flex-col leading-none">
            <span className="font-black text-lg text-foreground tracking-tight">{siteName}</span>
            <span className="text-[9px] font-bold text-secondary tracking-widest hidden sm:block">EDUCATION PLATFORM</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-1 bg-muted/30 rounded-full p-1 border border-border/30">
          {links.map((l) => (
            <Link key={l.to} to={l.to}
              className={`relative px-4 py-1.5 rounded-full text-sm font-bold transition-all duration-300 ${isActive(l.to) ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {isActive(l.to) && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-l from-secondary to-primary shadow-md shadow-secondary/30"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative z-10">{l.label}</span>
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          {!isAdmin && !isTeacher && (
            <Button variant="ghost" size="icon" className="rounded-xl hover:bg-secondary/10" asChild>
              <Link to="/search"><Search className="h-4 w-4" /></Link>
            </Button>
          )}
          <NotificationBell />
          {user ? (
            <>
              <Button variant="ghost" size="icon" className="rounded-xl hover:bg-secondary/10" asChild>
                <Link to="/profile"><User className="h-4 w-4" /></Link>
              </Button>
              <span className="text-sm font-bold text-foreground">{profile?.full_name || "المستخدم"}</span>
              <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="rounded-xl text-sm gap-2 border-2 border-secondary/40 text-secondary hover:bg-secondary hover:text-secondary-foreground hover:border-secondary font-black transition-all"
                asChild
              >
                <Link to="/teach-with-us">
                  <Sparkles className="h-4 w-4" />
                  إنضم لطاقم المدرسين
                </Link>
              </Button>
              <Button variant="ghost" className="rounded-xl text-sm font-bold hover:bg-muted/50" asChild>
                <Link to="/login">{loginText}</Link>
              </Button>
              <Button className="gradient-cta shadow-button text-secondary-foreground rounded-xl text-sm px-5 font-black hover:shadow-lg hover:shadow-secondary/30 transition-all" asChild>
                <Link to="/login">{ctaText}</Link>
              </Button>
            </>
          )}
        </div>

        <button className="md:hidden text-foreground p-2 rounded-xl hover:bg-muted/50 transition-colors" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="md:hidden border-t glass-strong overflow-hidden">
            <div className="container py-4 flex flex-col gap-1">
              {links.map((l, i) => (
                <motion.div key={l.to} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link to={l.to} className={`block py-2.5 px-3 rounded-xl text-sm font-medium transition-colors ${isActive(l.to) ? "bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted/50"}`} onClick={() => setOpen(false)}>
                    {l.label}
                  </Link>
                </motion.div>
              ))}
              <div className="flex flex-col gap-2 pt-3 mt-2 border-t">
                {user ? (
                  <Button variant="outline" className="w-full rounded-xl" onClick={handleSignOut}>تسجيل الخروج</Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="w-full rounded-xl gap-2 border-secondary/30 text-secondary hover:bg-secondary/10 hover:text-secondary font-bold"
                      asChild
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/teach-with-us">
                        <Sparkles className="h-4 w-4" />
                        إنضم لطاقم المدرسين
                      </Link>
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 rounded-xl" asChild onClick={() => setOpen(false)}><Link to="/login">{loginText}</Link></Button>
                      <Button className="flex-1 gradient-cta shadow-button text-secondary-foreground rounded-xl font-bold" asChild onClick={() => setOpen(false)}><Link to="/login">{ctaText}</Link></Button>
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
