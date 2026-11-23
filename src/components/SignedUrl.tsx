import { useEffect, useState, type ReactNode } from "react";
import { getSignedUrl, parseStorageRef } from "@/lib/signedStorageUrl";

export function useSignedUrl(stored?: string | null): string | undefined {
  const needs = !!stored && !!parseStorageRef(stored);
  const [url, setUrl] = useState<string | undefined>(needs ? undefined : stored || undefined);
  useEffect(() => {
    let alive = true;
    if (!stored) { setUrl(undefined); return; }
    if (!parseStorageRef(stored)) { setUrl(stored); return; }
    getSignedUrl(stored).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [stored]);
  return url;
}

/** Render-prop: gives children a usable (signed when needed) URL. */
export function SignedUrl({ url, children }: { url?: string | null; children: (u: string) => ReactNode }) {
  const u = useSignedUrl(url);
  if (!u) return null;
  return <>{children(u)}</>;
}

export function SignedAnchor({ url, ...rest }: { url: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const u = useSignedUrl(url);
  return <a {...rest} href={u || "#"} />;
}
