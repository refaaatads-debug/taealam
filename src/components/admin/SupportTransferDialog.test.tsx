import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SupportTransferDialog from "./SupportTransferDialog";
import type { SupportTransferAgent } from "@/lib/supportDepartments";

const agents: SupportTransferAgent[] = [
  {
    user_id: "users-agent",
    full_name: "موظف المستخدمين",
    support_departments: ["support_department_users"],
  },
  {
    user_id: "finance-agent",
    full_name: "موظف المالية",
    support_departments: ["support_department_finance"],
  },
];

describe("SupportTransferDialog", () => {
  const renderDialog = () => render(
    <SupportTransferDialog
      open
      onOpenChange={vi.fn()}
      agents={agents}
      loading={false}
      loadError={false}
      onRetry={vi.fn()}
      target={null}
      onTargetChange={vi.fn()}
      note=""
      onNoteChange={vi.fn()}
      transferring={false}
      onConfirm={vi.fn()}
    />,
  );

  it("shows departments first, then only the agents assigned to the selected department", () => {
    renderDialog();

    fireEvent.click(screen.getByTestId("transfer-department-support_department_users"));

    expect(screen.getByText("موظف المستخدمين")).toBeInTheDocument();
    expect(screen.queryByText("موظف المالية")).not.toBeInTheDocument();
  });

  it("returns the selected agent together with the selected department", () => {
    const onTargetChange = vi.fn();
    render(
      <SupportTransferDialog
        open
        onOpenChange={vi.fn()}
        agents={agents}
        loading={false}
        loadError={false}
        onRetry={vi.fn()}
        target={null}
        onTargetChange={onTargetChange}
        note=""
        onNoteChange={vi.fn()}
        transferring={false}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("transfer-department-support_department_finance"));
    fireEvent.click(screen.getByTestId("transfer-agent-finance-agent"));

    expect(onTargetChange).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "finance-agent",
      department_label: "المالية",
    }));
  });
});
