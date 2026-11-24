import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            data: [],
            error: null,
          }),
          single: () => ({ data: null, error: null }),
        }),
        in: () => ({ data: [], error: null }),
        order: () => ({
          data: [{ id: "s1", name: "رياضيات" }],
          error: null,
        }),
      }),
    }),
  },
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, profile: null, roles: [], signOut: vi.fn() }),
}));

describe("SearchTeacher Page", () => {
  it("renders the search page title", async () => {
    const SearchTeacher = (await import("@/pages/SearchTeacher")).default;
    const { getByText } = render(
      <BrowserRouter>
        <SearchTeacher />
      </BrowserRouter>
    );
    expect(getByText("ابحث عن مدرسك المثالي")).toBeInTheDocument();
  });

  it("renders search input", async () => {
    const SearchTeacher = (await import("@/pages/SearchTeacher")).default;
    const { getByPlaceholderText } = render(
      <BrowserRouter>
        <SearchTeacher />
      </BrowserRouter>
    );
    expect(getByPlaceholderText("ابحث بالاسم أو المادة...")).toBeInTheDocument();
  });
});
