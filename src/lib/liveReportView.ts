// Live session report: show only values that were measured during the session.
// No base score, no booked-length default, no hardcoded quality.

export interface LiveReportInput {
  elapsedSeconds: number;
  teacherSpeakingSec: number;
  studentSpeakingSec: number;
  messageCount: number;
}

export const MIN_SPEECH_SECONDS = 30;
export const MIN_MESSAGES = 3;
export const MIN_ELAPSED_SECONDS = 5 * 60;

export function hasEnoughLiveData(input: LiveReportInput): boolean {
  if (input.elapsedSeconds < MIN_ELAPSED_SECONDS) return false;
  const speech = input.teacherSpeakingSec + input.studentSpeakingSec;
  return input.messageCount >= MIN_MESSAGES || speech >= MIN_SPEECH_SECONDS;
}

export interface LiveMeasuredStats {
  elapsedMinutes: number;
  teacherSpeakingMinutes: number;
  studentSpeakingMinutes: number;
  silenceMinutes: number;
}

const toMinutes = (seconds: number) => Math.round((Math.max(0, seconds) / 60) * 10) / 10;

export function buildLiveMeasuredStats(input: LiveReportInput): LiveMeasuredStats {
  const silenceSeconds = Math.max(0, input.elapsedSeconds - input.teacherSpeakingSec - input.studentSpeakingSec);
  return {
    elapsedMinutes: toMinutes(input.elapsedSeconds),
    teacherSpeakingMinutes: toMinutes(input.teacherSpeakingSec),
    studentSpeakingMinutes: toMinutes(input.studentSpeakingSec),
    silenceMinutes: toMinutes(silenceSeconds),
  };
}
