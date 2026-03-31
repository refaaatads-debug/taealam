import { Link, useLocation } from "react-router-dom";
import { Home, Search, BookOpen, User, Brain } from "lucide-react";
import { motion } from "framer-motion";

const tabs = [
  { icon: Home, label: "الرئيسية", to: "/" },
  { icon: Search, label: "البحث", to: "/search" },
  { icon: BookOpen, label: "حصصي", to: "/student" },
  { icon: Brain, label: "AI مدرس", to: "/ai-tutor" },
  { icon: User, label: "حسابي", to: "/profile" },
];

const BottomNav = () => {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden glass-strong border-t safe-area-bottom">
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
