import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, BookOpen, User, Brain, GraduationCap, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";

const TOP_SCROLL_THRESHOLD = 24;
const DIRECTION_SCROLL_THRESHOLD = 12;

const BottomNav = () => {
  const { pathname } = useLocation();
  const { user, roles } = useAuth();
  const [isVisible, setIsVisible] = useState(true);
  const navRef = useRef<HTMLElement>(null);

  const isTeacher = roles.includes("teacher");
  const isAdmin = roles.includes("admin");
  const isStudent = !isTeacher && !isAdmin;

  useEffect(() => {
    const scrollStates = new WeakMap<EventTarget, {
      position: number;
      direction: -1 | 0 | 1;
      distance: number;
    }>();
    scrollStates.set(window, {
      position: window.scrollY,
      direction: 0,
      distance: 0,
    });

    const handleScroll = (event: Event) => {
      const target = event.target instanceof HTMLElement ? event.target : window;
      const position = target instanceof HTMLElement ? target.scrollTop : window.scrollY;
      const previous = scrollStates.get(target);

      if (!previous) {
        scrollStates.set(target, { position, direction: 0, distance: 0 });
        if (position <= TOP_SCROLL_THRESHOLD) setIsVisible(true);
        return;
      }

      const delta = position - previous.position;
      previous.position = position;

      if (position <= TOP_SCROLL_THRESHOLD) {
        previous.direction = 0;
        previous.distance = 0;
        setIsVisible(true);
        return;
      }

      if (Math.abs(delta) < 1) return;

      const direction: -1 | 1 = delta > 0 ? 1 : -1;
      if (previous.direction !== direction) {
        previous.direction = direction;
        previous.distance = 0;
      }
      previous.distance += Math.abs(delta);

      if (previous.distance >= DIRECTION_SCROLL_THRESHOLD) {
        setIsVisible(direction < 0);
        previous.distance = 0;
      }
    };

    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (navRef.current) navRef.current.inert = !isVisible;
  }, [isVisible]);



  const tabs = [
    ...(isStudent && user
      ? [{ icon: BookOpen, label: "حصصي", to: "/student" }]
      : isAdmin
        ? [{ icon: Shield, label: "الإدارة", to: "/admin" }]
        : isTeacher
          ? [{ icon: GraduationCap, label: "حصصي", to: "/teacher" }]
          : [{ icon: BookOpen, label: "حصصي", to: "/student" }]),
    ...(!isAdmin && !isTeacher ? [{ icon: Search, label: "البحث", to: "/search" }] : []),
    ...(!isAdmin ? [{ icon: Brain, label: "سند الذكي", to: "/ai-tutor" }] : []),
    { icon: User, label: "حسابي", to: "/profile" },
  ];

  return (
    <nav
      ref={navRef}
      aria-hidden={!isVisible}
      data-testid="bottom-navigation"
      className={`fixed bottom-0 left-0 right-0 z-50 border-t border-primary/10 bg-background/95 backdrop-blur-xl safe-area-bottom transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none ${
        isVisible ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab) => {
          const active = pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-xl transition-colors relative ${
                active ? "text-secondary" : "text-muted-foreground"
              }`}
            >
              {active && (
                <motion.div
                  layoutId="bottom-nav-indicator"
                  className="absolute -top-0.5 w-8 h-1 rounded-full bg-secondary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <tab.icon className={`h-5 w-5 ${active ? "text-secondary" : ""}`} />
              <span className={`text-[10px] font-semibold ${active ? "text-secondary" : ""}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
