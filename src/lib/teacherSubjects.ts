export function toggleTeacherSubjectSelection(
  selectedSubjectIds: string[],
  subjectId: string,
): string[] {
  return selectedSubjectIds.includes(subjectId)
    ? selectedSubjectIds.filter((selectedId) => selectedId !== subjectId)
    : [...selectedSubjectIds, subjectId];
}
