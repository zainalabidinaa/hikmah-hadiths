import type { NormalizedGrading } from "../types.js"

export function mapArabicGradeToCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  if (!trimmed) {
    return null
  }
  if (trimmed.includes("لم يخرجه")) return "lamYukhrij"
  if (trimmed.includes("صحيح")) return "sahih"
  if (trimmed.includes("حسن")) return "hasan"
  if (trimmed.includes("موثق") || trimmed.includes("موثّق")) return "muwaththaq"
  if (trimmed.includes("ضعيف") || trimmed.includes("مجهول") || trimmed.includes("مرسل") || trimmed.includes("مرفوع")) return "daif"
  return "unknown"
}

function gradePriority(code: string | null): number {
  switch (code) {
    case "sahih":
      return 0
    case "hasan":
      return 1
    case "muwaththaq":
      return 2
    case "daif":
      return 3
    case "lamYukhrij":
      return 4
    default:
      return 5
  }
}

function scholarPriority(name: string): number {
  const lowered = name.toLowerCase()
  if (lowered.includes("majlisi")) return 0
  if (lowered.includes("behbudi") || lowered.includes("behboodi")) return 1
  return 2
}

export function dedupeAndSortGradings(gradings: NormalizedGrading[]): NormalizedGrading[] {
  const seen = new Set<string>()
  const deduped = gradings.filter((grading) => {
    const key = [grading.gradeCode ?? "", grading.reference, grading.gradedBy].join("|")
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })

  return deduped.sort((left, right) => {
    const leftScholarPriority = scholarPriority(left.gradedBy)
    const rightScholarPriority = scholarPriority(right.gradedBy)
    if (leftScholarPriority !== rightScholarPriority) {
      return leftScholarPriority - rightScholarPriority
    }

    const leftGradePriority = gradePriority(left.gradeCode)
    const rightGradePriority = gradePriority(right.gradeCode)
    if (leftGradePriority !== rightGradePriority) {
      return leftGradePriority - rightGradePriority
    }

    return left.reference.localeCompare(right.reference)
  })
}

export function normalizeKey(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}
