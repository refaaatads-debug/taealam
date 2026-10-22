export type MinutePackageStatus = "none" | "available" | "depleted";

export function getMinutePackageStatus(input: {
  hasSubscription: boolean;
  remainingMinutes: number;
  /** Legacy audit metadata only; never determines minute availability. */
  endsAt?: string | null;
}): MinutePackageStatus {
  if (!input.hasSubscription) return "none";
  return input.remainingMinutes > 0 ? "available" : "depleted";
}
