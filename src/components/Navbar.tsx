import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, GraduationCap, User, Search, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import { useSiteSettings } from "@/hooks/useSiteSettings";

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
    ...(isStudent ? [{ label: "الباقات", to: "/pricing" }] : []),
    ...(!user ? [{ label: "الباقات", to: "/pricing" }] : []),
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
    <nav className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "glass-strong shadow-card border-b" : "bg-card/60 backdrop-blur-md border-b border-transparent"}`}>
      <div className="container flex items-center justify-between h-16">
        <Link to={isAdmin ? "/admin" : isTeacher ? "/teacher" : isStudent ? "/student" : "/"} className="flex items-center gap-2.5 group">
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} className="h-9 w-9 rounded-xl object-cover transition-transform group-hover:scale-110" />
          ) : (
            <div className="w-9 h-9 rounded-xl gradient-cta flex items-center justify-center transition-transform group-hover:scale-110">
              <GraduationCap className="h-5 w-5 text-secondary-foreground" />
            </div>
          )}
          <span className="font-extrabold text-xl text-foreground">{siteName}</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link key={l.to} to={l.to}
              className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive(l.to) ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
              {l.label}
              {isActive(l.to) && <motion.div layoutId="nav-indicator" className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          {!isAdmin && !isTeacher && (
            <Button variant="ghost" size="icon" className="rounded-xl" asChild>
              <Link to="/search"><Search className="h-4 w-4" /></Link>
            </Button>
          )}
          <NotificationBell />
          {user ? (
            <>
              <Button variant="ghost" size="icon" className="rounded-xl" asChild>
                <Link to="/profile"><User className="h-4 w-4" /></Link>
              </Button>
              <span className="text-sm text-muted-foreground">{profile?.full_name || "المستخدم"}</span>
              <Button variant="ghost" size="icon" className="rounded-xl text-muted-foreground" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="rounded-xl text-sm" asChild>
                <Link to="/login">{loginText}</Link>
              </Button>
              <Button className="gradient-cta shadow-button text-secondary-foreground rounded-xl text-sm px-5" asChild>
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
              <div className="flex gap-2 pt-3 mt-2 border-t">
                {user ? (
                  <Button variant="outline" className="flex-1 rounded-xl" onClick={handleSignOut}>تسجيل الخروج</Button>
                ) : (
                  <>
                    <Button variant="outline" className="flex-1 rounded-xl" asChild><Link to="/login">{loginText}</Link></Button>
                    <Button className="flex-1 gradient-cta shadow-button text-secondary-foreground rounded-xl" asChild><Link to="/login">{ctaText}</Link></Button>
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
