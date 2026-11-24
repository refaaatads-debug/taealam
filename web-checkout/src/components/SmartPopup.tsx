import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Brain, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

export default function SmartPopup() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("popup_dismissed");
    if (dismissed) return;

    const timer = setTimeout(() => setShow(true), 12000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setShow(false);
    sessionStorage.setItem("popup_dismissed", "1");
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.95 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50"
        >
          <div className="glass-strong rounded-2xl shadow-card-hover border border-border/50 p-5 relative">
            <button onClick={dismiss} className="absolute top-3 left-3 text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1">
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-secondary/10 flex items-center justify-center shrink-0">
                <Brain className="h-6 w-6 text-secondary" />
              </div>
              <div className="flex-1">
                <p className="font-black text-foreground mb-1">هل تحتاج مساعدة في اختيار مدرس؟ 🎯</p>
                <p className="text-xs text-muted-foreground mb-3">دع الذكاء الاصطناعي يختار لك المدرس المثالي بناءً على مستواك واحتياجاتك</p>
                <div className="flex gap-2">
                  <Button size="sm" className="gradient-cta text-secondary-foreground rounded-xl shadow-button text-xs" asChild>
                    <Link to="/search" onClick={dismiss}>
                      <Sparkles className="h-3.5 w-3.5 ml-1" />
                      اقترح لي مدرس
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-xl text-xs text-muted-foreground" onClick={dismiss}>
                    لاحقاً
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
