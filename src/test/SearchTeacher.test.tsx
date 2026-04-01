import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            data: [
              {
                id: "t1",
                user_id: "u1",
                bio: "مدرس رياضيات",
                hourly_rate: 100,
                avg_rating: 4.8,
                total_sessions: 50,
                total_reviews: 10,
                is_verified: true,
                years_experience: 5,
                available_from: "15:00",
                available_to: "21:00",
                is_approved: true,
              },
            ],
            error: null,
          }),
        }),
        in: () => ({
          data: [],
          error: null,
        }),
        order: () => ({
          data: [{ id: "s1", name: "رياضيات" }],
          error: null,
        }),
      }),
    }),
  },
}));

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock AuthContext
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, profile: null }),
}));

describe("SearchTeacher Page", () => {
  it("renders the search page title", async () => {
    const SearchTeacher = (await import("@/pages/SearchTeacher")).default;
    render(
      <BrowserRouter>
        <SearchTeacher />
      </BrowserRouter>
    );
    expect(screen.getByText("ابحث عن مدرسك المثالي")).toBeInTheDocument();
  });

  it("renders filter controls", async () => {
    const SearchTeacher = (await import("@/pages/SearchTeacher")).default;
    render(
      <BrowserRouter>
        <SearchTeacher />
      </BrowserRouter>
    );
    expect(screen.getByPlaceholderText("ابحث بالاسم أو المادة...")).toBeInTheDocument();
  });
});
