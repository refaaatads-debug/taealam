import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
        in: () => ({ data: [], error: null }),
      }),
      insert: () => ({
        select: () => ({
          single: () => ({ data: { id: "b1" }, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", user_metadata: { full_name: "Test" } }, profile: { full_name: "Test" } }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("Booking Page", () => {
  it("shows 'choose teacher' message when no teacher param", async () => {
    const Booking = (await import("@/pages/Booking")).default;
    render(
      <BrowserRouter>
        <Booking />
      </BrowserRouter>
    );
    expect(screen.getByText("اختر مدرساً أولاً")).toBeInTheDocument();
  });

  it("shows search link when no teacher selected", async () => {
    const Booking = (await import("@/pages/Booking")).default;
    render(
      <BrowserRouter>
        <Booking />
      </BrowserRouter>
    );
    expect(screen.getByText("ابحث عن مدرس")).toBeInTheDocument();
  });
});
