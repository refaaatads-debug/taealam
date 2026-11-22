import { describe, expect, it } from "vitest";
import appSource from "../App.tsx?raw";
import { isPublicAuthPath } from "./publicAuthPaths";

describe("signed-out public pages", () => {
  it("covers every explicit public route in App.tsx", () => {
    const app = appSource;
    const routes = [...app.matchAll(/<Route path="([^"]+)" element=\{(?!<ProtectedRoute)/g)]
      .map((match) => match[1]).filter((path) => path !== "*");
    expect(routes.length).toBeGreaterThan(15);
    for (const path of routes) expect(isPublicAuthPath(path), path).toBe(true);
  });
  it("keeps protected pages and lookalike prefixes private", () => {
    for (const path of ["/student", "/teacher", "/admin", "/pricing", "/chat", "/booking", "/profile", "/complete-profile", "/payment-success", "/privacy-private", "/helpdesk"])
      expect(isPublicAuthPath(path), path).toBe(false);
  });
  it("allows trailing slashes on public pages", () => {
    expect(isPublicAuthPath("/privacy/")).toBe(true);
    expect(isPublicAuthPath("/terms/")).toBe(true);
  });
});
