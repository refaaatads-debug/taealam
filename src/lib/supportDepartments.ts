export const SUPPORT_DEPARTMENTS = [
  { key: "support_department_users", label: "إدارة المستخدمين" },
  { key: "support_department_teachers", label: "المعلمون" },
  { key: "support_department_sessions", label: "الحجوزات والحصص" },
  { key: "support_department_finance", label: "المالية" },
  { key: "support_department_security", label: "الأمان والمخالفات" },
  { key: "support_department_system", label: "النظام والإعدادات" },
] as const;

export const SUPPORT_DEPARTMENT_PERMISSION_KEYS = SUPPORT_DEPARTMENTS.map(
  (department) => department.key,
);

export const GENERAL_SUPPORT_DEPARTMENT_KEY = "support_general";
export const GENERAL_SUPPORT_DEPARTMENT_LABEL = "الدعم العام";

export interface SupportTransferAgent {
  user_id: string;
  full_name: string;
  support_departments: string[] | null;
}

export interface SupportDepartmentGroup {
  key: string;
  label: string;
  agents: SupportTransferAgent[];
}

export function groupSupportTransferAgents(
  agents: SupportTransferAgent[],
): SupportDepartmentGroup[] {
  const departmentGroups: SupportDepartmentGroup[] = SUPPORT_DEPARTMENTS.map((department) => ({
    key: department.key,
    label: department.label,
    agents: agents.filter((agent) =>
      (agent.support_departments ?? []).includes(department.key),
    ),
  })).filter((group) => group.agents.length > 0);

  const generalAgents = agents.filter(
    (agent) => (agent.support_departments ?? []).length === 0,
  );

  if (generalAgents.length > 0) {
    departmentGroups.push({
      key: GENERAL_SUPPORT_DEPARTMENT_KEY,
      label: GENERAL_SUPPORT_DEPARTMENT_LABEL,
      agents: generalAgents,
    });
  }

  return departmentGroups;
}
