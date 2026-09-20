import { useEffect, useRef, useState } from "react";

type TurnstileWidgetApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileWidgetApi;
  }
}

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

const loadTurnstile = () =>
  new Promise<void>((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }

    const existingScript = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Turnstile script failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });

interface TurnstileWidgetProps {
  onToken: (token: string | null) => void;
  className?: string;
}

const TurnstileWidget = ({ onToken, className }: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    let widgetId: string | undefined;

    onToken(null);

    if (!SITE_KEY) {
      setError(true);
      return () => undefined;
    }

    void loadTurnstile()
      .then(() => {
        if (!mounted || !containerRef.current || !window.turnstile) return;

        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: "auto",
          callback: (token) => {
            if (!mounted) return;
            setError(false);
            onToken(token);
          },
          "expired-callback": () => {
            if (!mounted) return;
            onToken(null);
          },
          "error-callback": () => {
            if (!mounted) return;
            setError(true);
            onToken(null);
          },
        });
      })
      .catch(() => {
        if (!mounted) return;
        setError(true);
        onToken(null);
      });

    return () => {
      mounted = false;
      if (widgetId && window.turnstile?.remove) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [onToken]);

  return (
    <div className={className} aria-live="polite">
      <div ref={containerRef} className="min-h-[65px] flex justify-center" />
      {error && (
        <p className="text-center text-xs text-destructive mt-1">
          تعذر تحميل التحقق الأمني. أعد تحميل الصفحة وحاول مرة أخرى.
        </p>
      )}
    </div>
  );
};

export default TurnstileWidget;