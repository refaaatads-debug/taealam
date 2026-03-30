import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  const [open, setOpen] = useState(false);

  const links = [
    { label: "الرئيسية", to: "/" },
    { label: "ابحث عن مدرس", to: "/search" },
    { label: "لوحة الطالب", to: "/student" },
    { label: "لوحة المعلم", to: "/teacher" },
    { label: "ولي الأمر", to: "/parent" },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2 text-primary font-bold text-xl">
          <GraduationCap className="h-7 w-7" />
          <span>تعلّم</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link to="/login">تسجيل الدخول</Link>
          </Button>
          <Button className="gradient-cta shadow-button text-secondary-foreground" asChild>
            <Link to="/login">إنشاء حساب</Link>
          </Button>
        </div>

        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t bg-card animate-fade-in">
          <div className="container py-4 flex flex-col gap-3">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="py-2 text-sm font-medium text-muted-foreground" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" asChild>
                <Link to="/login">تسجيل الدخول</Link>
              </Button>
              <Button className="flex-1 gradient-cta shadow-button text-secondary-foreground" asChild>
                <Link to="/login">إنشاء حساب</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
