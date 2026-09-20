import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

const chainable = (terminal = { data: [], error: null, count: 0 }) => {
  const fn: any = () => chainable(terminal);
  fn.select = () => chainable(terminal);
  fn.insert = () => chainable(terminal);
  fn.update = () => chainable(terminal);
  fn.eq = () => chainable(terminal);
  fn.in = () => chainable(terminal);
  fn.order = () => chainable(terminal);
  fn.limit = () => Promise.resolve(terminal);
  fn.maybeSingle = () => Promise.resolve(terminal);
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
  useAuth: () => ({ user: { id: "admin1" }, profile: { full_name: "Admin" }, roles: ["admin"], signOut: vi.fn() }),
}));

vi.mock("recharts", () => ({
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    img: ({ children, ...props }: any) => <img {...props}>{children}</img>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("AdminDashboard Page", () => {
  it("renders admin dashboard title", async () => {
    const AdminDashboard = (await import("@/pages/AdminDashboard")).default;
    const { container } = render(
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AdminDashboard />
      </BrowserRouter>
    );
    await waitFor(() => {
      expect(container.querySelector("h1")).toHaveTextContent("نظرة عامة");
    });
  });
});
