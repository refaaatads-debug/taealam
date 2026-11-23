import * as React from "react";

/**
 * Detects if the user is on a phone/mobile device (not just a small viewport).
 * Uses User-Agent + touch capability to differentiate phones from desktops/laptops.
 * Used to restrict teacher-only actions (e.g., starting a session) to desktop/laptop.
 */
export function useIsPhoneDevice() {
  const [isPhone, setIsPhone] = React.useState<boolean>(false);

  React.useEffect(() => {
    const ua = navigator.userAgent || "";
    const uaPhone = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
    const smallScreen = window.innerWidth < 1024;
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    // Treat as phone if UA matches mobile, OR (touch device AND small screen)
    setIsPhone(uaPhone || (hasTouch && smallScreen));
  }, []);

  return isPhone;
}
