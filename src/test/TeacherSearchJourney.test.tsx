import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import TeacherSearchJourney from "@/components/TeacherSearchJourney";

function renderJourney() {
  return render(
    <MemoryRouter>
      <main className="ajyal-discovery" dir="rtl">
        <TeacherSearchJourney />
      </main>
    </MemoryRouter>,
  );
}

describe("TeacherSearchJourney", () => {
  it("updates the displayed step without claiming prior stages are complete", () => {
    renderJourney();

    fireEvent.click(screen.getByRole("tab", { name: /الخطوة ٠٣ اختر طريقة التعلّم/ }));

    expect(screen.getByRole("heading", { name: "اختر طريقة التعلّم" })).toBeInTheDocument();
    expect(screen.getByLabelText("الخطوة المعروضة: ٠٣ من ٠٤")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /الخطوة ٠١ أنشئ حسابك/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByText(/مكتملة|أكملت/)).not.toBeInTheDocument();
  });

  it("supports keyboard stage selection and links only to the intended destinations", () => {
    renderJourney();
    const firstTab = screen.getByRole("tab", { name: /الخطوة ٠١ أنشئ حسابك/ });

    fireEvent.keyDown(firstTab, { key: "ArrowDown" });
    expect(screen.getByRole("heading", { name: "استكشف المعلّمين" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /الخطوة ٠٤ واصل التعلّم/ }));
    expect(screen.getByRole("link", { name: /تعرّف على سند/ })).toHaveAttribute("href", "/ai-tutor");
    expect(screen.getByRole("link", { name: /أداة الواجبات/ })).toHaveAttribute("href", "/homework-solver");
  });
});
