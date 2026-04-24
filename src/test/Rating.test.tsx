import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Rating from "@/pages/Rating";

// Mock auth
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "student-1" }, profile: { full_name: "أحمد" } }),
}));

const maybeSingle = vi.fn();
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle }) }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => fromMock(table),
  },
}));

const renderAt = (initial: string) =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/rating" element={<Rating />} />
        <Route path="/student" element={<div data-testid="student-dash">لوحة التحكم</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("Rating page redirects (no 404)", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    fromMock.mockClear();
  });

  it("redirects to /student when no booking param is present", async () => {
    renderAt("/rating");
    await waitFor(() => {
      expect(screen.getByTestId("student-dash")).toBeInTheDocument();
    });
  });

  it("redirects to /student when booking does not belong to user", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: "b-1", student_id: "other-user" } });
    renderAt("/rating?booking=b-1");
    await waitFor(() => {
      expect(screen.getByTestId("student-dash")).toBeInTheDocument();
    });
  });

  it("redirects to /student when booking is missing in DB", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null });
    renderAt("/rating?booking=missing");
    await waitFor(() => {
      expect(screen.getByTestId("student-dash")).toBeInTheDocument();
    });
  });

  it("renders the rating UI when booking belongs to current student", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: "b-1", student_id: "student-1" } });
    renderAt("/rating?booking=b-1");
    await waitFor(() => {
      expect(screen.getByText(/كيف كانت الحصة؟/)).toBeInTheDocument();
    });
  });
});
