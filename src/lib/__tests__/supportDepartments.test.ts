import { describe, expect, it } from "vitest";
import {
  GENERAL_SUPPORT_DEPARTMENT_KEY,
  groupSupportTransferAgents,
  type SupportTransferAgent,
} from "../supportDepartments";

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
  {
    user_id: "multi-agent",
    full_name: "موظف مشترك",
    support_departments: [
      "support_department_users",
      "support_department_finance",
    ],
  },
  {
    user_id: "general-agent",
    full_name: "موظف الدعم العام",
    support_departments: [],
  },
];

describe("groupSupportTransferAgents", () => {
  it("groups employees only into the support departments assigned to them", () => {
    const groups = groupSupportTransferAgents(agents);
    const usersGroup = groups.find(
      (group) => group.key === "support_department_users",
    );
    const financeGroup = groups.find(
      (group) => group.key === "support_department_finance",
    );

    expect(usersGroup?.agents.map((agent) => agent.user_id)).toEqual([
      "users-agent",
      "multi-agent",
    ]);
    expect(financeGroup?.agents.map((agent) => agent.user_id)).toEqual([
      "finance-agent",
      "multi-agent",
    ]);
  });

  it("keeps support employees without a department under general support", () => {
    const groups = groupSupportTransferAgents(agents);
    const generalGroup = groups.find(
      (group) => group.key === GENERAL_SUPPORT_DEPARTMENT_KEY,
    );

    expect(generalGroup?.agents.map((agent) => agent.user_id)).toEqual([
      "general-agent",
    ]);
  });

  it("does not show an empty department or expose an unknown scope as general support", () => {
    const groups = groupSupportTransferAgents([
      {
        user_id: "unknown-agent",
        full_name: "موظف",
        support_departments: ["support_department_future"],
      },
    ]);

    expect(groups).toEqual([]);
  });
});
