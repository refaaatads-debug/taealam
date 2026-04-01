import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          data: [],
          error: null,
          order: () => ({
            limit: () => ({ data: [], error: null }),
            data: [],
            error: null,
          }),
        }),
        order: () => ({
          limit: () => ({ data: [], error: null }),
        }),
        limit: () => ({ data: [], error: null }),
        in: () => ({ data: [], error: null }),
        count: 0,
        head: true,
      }),
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin1" }, profile: { full_name: "Admin" } }),
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
  },
}));

describe("AdminDashboard Page", () => {
  it("renders admin dashboard title", async () => {
    const AdminDashboard = (await import("@/pages/AdminDashboard")).default;
    render(
      <BrowserRouter>
        <AdminDashboard />
      </BrowserRouter>
    );
    expect(screen.getByText("لوحة التحكم")).toBeInTheDocument();
  });
});
