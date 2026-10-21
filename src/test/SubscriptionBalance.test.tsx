import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import SubscriptionBalance from "@/components/student/SubscriptionBalance";

const renderBalance = (props: Partial<React.ComponentProps<typeof SubscriptionBalance>> = {}) =>
  render(
    <MemoryRouter>
      <SubscriptionBalance subscription={null} stripeSubscription={null} {...props} />
    </MemoryRouter>,
  );

describe("SubscriptionBalance loading states", () => {
  it("does not claim there is no package while the first balance request is loading", () => {
    renderBalance({ loading: true });

    expect(screen.getByText("جارٍ تحميل رصيد الباقة…")).toBeInTheDocument();
    expect(screen.queryByText("لا توجد باقة نشطة حالياً")).not.toBeInTheDocument();
  });

  it("shows a retry state when the balance request fails", () => {
    const onRetry = vi.fn();
    renderBalance({ loading: false, loadError: true, onRetry });

    expect(screen.getByText("تعذر تحميل رصيد الباقة")).toBeInTheDocument();
    expect(screen.queryByText("لا توجد باقة نشطة حالياً")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the no-package message only after a successful empty result", () => {
    renderBalance({ loading: false, loadError: false });

    expect(screen.getByText("لا توجد باقة نشطة حالياً")).toBeInTheDocument();
  });
});
