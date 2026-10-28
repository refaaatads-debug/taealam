/** Normalize a calculated call reservation to SAR cents before invoking wallet RPCs. */
export function callWalletAmount(minutes: number, pricePerMinute: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0
    || !Number.isFinite(pricePerMinute) || pricePerMinute <= 0) {
    throw new Error("Invalid call reservation");
  }
  const amount = Math.round(Math.ceil(minutes) * pricePerMinute * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid call reservation");
  return amount;
}
