export function getTeacherApprovalState(approvalStatus: string | null, isApproved: boolean) {
  const status = approvalStatus?.trim().toLowerCase() ?? "";
  return {
    // A pending legacy request label alongside the approved boolean is stale
    // metadata; it is not a second approval domain and should not be called a
    // contradiction. Keep it visible for audit without changing account data.
    stalePendingLabel: status === "pending" && isApproved,
    conflict:
      (status === "approved" && !isApproved) ||
      (status === "rejected" && isApproved),
  };
}
