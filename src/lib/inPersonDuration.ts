export const IN_PERSON_DURATION_MINUTES = { min: 15, max: 180 } as const;

export function isValidInPersonDuration(value: number): boolean {
  return Number.isInteger(value)
    && value >= IN_PERSON_DURATION_MINUTES.min
    && value <= IN_PERSON_DURATION_MINUTES.max;
}

export function packageMinutesForInPersonLesson(teachingMinutes: number): number {
  if (!isValidInPersonDuration(teachingMinutes)) {
    throw new RangeError("In-person lesson duration must be an integer from 15 to 180 minutes");
  }
  return teachingMinutes;
}
