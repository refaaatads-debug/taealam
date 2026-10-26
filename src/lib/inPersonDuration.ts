export const IN_PERSON_DURATION_MINUTES = { min: 15, max: 180 } as const;
export const IN_PERSON_PACKAGE_DEBIT_MINUTES = { min: 15, max: 180 } as const;

export function isValidInPersonDuration(value: number): boolean {
  return Number.isInteger(value)
    && value >= IN_PERSON_DURATION_MINUTES.min
    && value <= IN_PERSON_DURATION_MINUTES.max;
}

export function isValidInPersonPackageDebit(value: number, teachingMinutes?: number): boolean {
  return Number.isInteger(value)
    && value >= IN_PERSON_PACKAGE_DEBIT_MINUTES.min
    && value <= IN_PERSON_PACKAGE_DEBIT_MINUTES.max
    && (teachingMinutes === undefined || value >= teachingMinutes);
}

export function packageMinutesForInPersonLesson(teachingMinutes: number, packageDebitMinutes = 100): number {
  if (!isValidInPersonDuration(teachingMinutes)) {
    throw new RangeError("In-person lesson duration must be an integer from 15 to 180 minutes");
  }
  if (!isValidInPersonPackageDebit(packageDebitMinutes, teachingMinutes)) {
    throw new RangeError("In-person package debit must be at least the teaching duration and at most 180 minutes");
  }
  return packageDebitMinutes;
}
