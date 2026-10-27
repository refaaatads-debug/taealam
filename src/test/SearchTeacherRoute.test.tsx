import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SearchTeacherRoute from "@/pages/SearchTeacherRoute";

const authState = vi.hoisted(() => ({
  current: {
    user: null as { id: string } | null,
    loading: false,
    roles: [] as string[],
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState.current,
}));

vi.mock("@/components/ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/pages/TeacherSearchLanding", () => ({
  default: () => <main>public discovery landing</main>,
}));

vi.mock("@/pages/SearchTeacher", () => ({
  default: () => <main>registered student search</main>,
}));

function renderSearchRoute() {
  return render(
    <MemoryRouter initialEntries={["/search"]}>
      <Routes>
        <Route path="/search" element={<SearchTeacherRoute />} />
        <Route path="/admin" element={<div>admin dashboard</div>} />
        <Route path="/teacher" element={<div>teacher dashboard</div>} />
        <Route path="/parent" element={<div>parent dashboard</div>} />
        <Route path="/student" element={<div>student dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SearchTeacherRoute", () => {
  beforeEach(() => {
    authState.current = { user: null, loading: false, roles: [] };
  });

  it("shows the public introduction to visitors without mounting search", async () => {
    renderSearchRoute();

    expect(await screen.findByText("public discovery landing")).toBeInTheDocument();
    expect(screen.queryByText("registered student search")).not.toBeInTheDocument();
  });

  it("shows the functional search only to registered students", async () => {
    authState.current = {
      user: { id: "student-1" },
      loading: false,
      roles: ["student"],
    };

    renderSearchRoute();

    expect(await screen.findByText("registered student search")).toBeInTheDocument();
    expect(screen.queryByText("public discovery landing")).not.toBeInTheDocument();
  });

  it("redirects other account roles away from teacher search", async () => {
    authState.current = {
      user: { id: "teacher-1" },
      loading: false,
      roles: ["teacher"],
    };

    renderSearchRoute();

    expect(await screen.findByText("teacher dashboard")).toBeInTheDocument();
    expect(screen.queryByText("registered student search")).not.toBeInTheDocument();
  });
});
