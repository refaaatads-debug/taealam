export type AdminBookingPriceInput = {
  source: "booking" | "request";
  status: string;
  delivery_mode?: "online" | "in_person" | null;
  price?: number | string | null;
  in_person_student_value_sar?: number | string | null;
  online_gross_amount?: number | string | null;
};

function validAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** Only completed bookings have an actual lesson price; never reprice history. */
export function resolveActualBookingPrice(record: AdminBookingPriceInput): number {
  if (record.source !== "booking" || record.status !== "completed") return 0;

  const actualPrice = record.delivery_mode === "in_person"
    ? validAmount(record.in_person_student_value_sar)
    : validAmount(record.online_gross_amount);

  return actualPrice ?? validAmount(record.price) ?? 0;
}
