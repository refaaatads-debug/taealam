import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

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
    img: ({ children, ...props }: any) => <img {...props}>{children}</img>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
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
      <HelmetProvider>
        <BrowserRouter>
          <SearchTeacher />
        </BrowserRouter>
      </HelmetProvider>
    );
    expect(getByText("ابحث عن مدرسك المثالي")).toBeInTheDocument();
  });

  it("renders search input", async () => {
    const SearchTeacher = (await import("@/pages/SearchTeacher")).default;
    const { getByPlaceholderText } = render(
      <HelmetProvider>
        <BrowserRouter>
          <SearchTeacher />
        </BrowserRouter>
      </HelmetProvider>
    );
    expect(getByPlaceholderText("ابحث بالاسم أو المادة...")).toBeInTheDocument();
  });
});
