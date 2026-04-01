import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// Deep chainable mock
const chainable = (terminal = { data: [], error: null, count: 0 }) => {
  const fn: any = () => chainable(terminal);
  fn.select = () => chainable(terminal);
  fn.insert = () => chainable(terminal);
  fn.update = () => chainable(terminal);
  fn.eq = () => chainable(terminal);
  fn.in = () => chainable(terminal);
  fn.order = () => chainable(terminal);
  fn.limit = () => Promise.resolve(terminal);
  fn.single = () => Promise.resolve(terminal);
  fn.gte = () => chainable(terminal);
  fn.lte = () => chainable(terminal);
  fn.then = (resolve: any) => Promise.resolve(terminal).then(resolve);
  fn.data = terminal.data;
  fn.error = terminal.error;
  fn.count = terminal.count;
  return fn;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => chainable(),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", user_metadata: { full_name: "Test" } }, profile: { full_name: "Test" }, roles: ["student"], signOut: vi.fn() }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("Booking Page", () => {
  it("shows choose teacher message when no teacher param", async () => {
    const Booking = (await import("@/pages/Booking")).default;
    const { getByText } = render(
      <BrowserRouter>
        <Booking />
      </BrowserRouter>
    );
    expect(getByText("اختر مدرساً أولاً")).toBeInTheDocument();
  });

  it("shows search button link", async () => {
    const Booking = (await import("@/pages/Booking")).default;
    const { getAllByText } = render(
      <BrowserRouter>
        <Booking />
      </BrowserRouter>
    );
    expect(getAllByText("ابحث عن مدرس").length).toBeGreaterThan(0);
  });
});
