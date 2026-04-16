import { dedupeAndSortGradings, mapArabicGradeToCode, normalizeKey } from "../lib/grades.js"
import { readJson } from "../lib/io.js"
import { sourceScopedSlug, slugify } from "../lib/slug.js"
import type { NormalizedBook, NormalizedGrading } from "../types.js"

interface AppManifest {
  books: Array<{
    bookID: string
    file: string
    cover?: string
  }>
}

interface AppGrading {
  grade: string
  reference: string
  gradedBy: string
}

interface AppHadith {
  id: number
  arabicText: string
  englishText: string
  chain?: string | null
  grading?: AppGrading | null
  allGradings?: AppGrading[]
}

interface AppChapter {
  id: number
  title: string
  contentKind?: string
  hadiths: AppHadith[]
}

interface AppSection {
  id: number
  title: string
  webURL?: string | null
  chapters: AppChapter[]
}

interface AppVolume {
  id: number
  title?: string | null
  webURL?: string | null
  sections: AppSection[]
}

interface AppBookFile {
  bookID: string
  titleArabic?: string | null
  titleTranslit?: string | null
  subtitle?: string | null
  author?: string | null
  coverImage?: string | null
  volumes: AppVolume[]
}

interface GradingIndexPayload {
  version: number
  entries: Record<string, Array<{
    grade_ar: string
    grade_en: string
    reference_en: string
    author_name_en: string
    author_name_ar: string
  }>>
}

function asNormalizedGrading(grading: AppGrading): NormalizedGrading {
  return {
    gradeCode: grading.grade || null,
    gradeArabic: null,
    gradeEnglish: null,
    reference: grading.reference,
    gradedBy: grading.gradedBy,
  }
}

function gradingLookupKey(bookId: string, volumeId: number, sectionId: number, chapterTitle: string, hadithNumber: number): string {
  return `${bookId}|${volumeId}|${sectionId}|${normalizeKey(chapterTitle)}|${hadithNumber}`
}

function buildGradingIndex(payload: GradingIndexPayload): Record<string, NormalizedGrading[]> {
  const mapped: Record<string, NormalizedGrading[]> = {}
  for (const [key, rows] of Object.entries(payload.entries)) {
    mapped[key] = dedupeAndSortGradings(
      rows
        .map((row) => ({
          gradeCode: mapArabicGradeToCode(row.grade_ar),
          gradeArabic: row.grade_ar || null,
          gradeEnglish: row.grade_en || null,
          reference: row.reference_en?.trim() || "Thaqalayn.net",
          gradedBy: row.author_name_en?.trim() || row.author_name_ar?.trim() || "Unspecified scholar",
        }))
        .filter((grading) => grading.reference || grading.gradedBy),
    )
  }
  return mapped
}

export async function loadAppOfflineBooks(source: { localPath?: string; baseUrl?: string }): Promise<NormalizedBook[]> {
  const manifest = await readJson<AppManifest>("manifest.json", source)
  let gradingIndex: Record<string, NormalizedGrading[]> = {}

  try {
    const gradingPayload = await readJson<GradingIndexPayload>("hikmah_gradings_index.json", source)
    gradingIndex = buildGradingIndex(gradingPayload)
  } catch {
    try {
      const gradingPayload = await readJson<GradingIndexPayload>("thaqalayn_gradings_index.json", source)
      gradingIndex = buildGradingIndex(gradingPayload)
    } catch {
      gradingIndex = {}
    }
  }

  const books: NormalizedBook[] = []

  for (const manifestBook of manifest.books) {
    const payload = await readJson<AppBookFile>(manifestBook.file, source)
    const titleTranslit = payload.titleTranslit ?? payload.bookID

    books.push({
      sourceName: "hikmah_offline",
      sourceBookId: payload.bookID,
      slug: sourceScopedSlug("hikmah-offline", payload.bookID),
      workSlug: slugify(payload.titleTranslit ?? payload.bookID),
      titleArabic: payload.titleArabic ?? null,
      titleTranslit,
      englishName: titleTranslit,
      subtitle: payload.subtitle ?? null,
      author: payload.author ?? null,
      translator: null,
      description: null,
      coverImageUrl: manifestBook.cover ?? payload.coverImage ?? null,
      category: null,
      bookUrl: null,
      extra: {
        manifestFile: manifestBook.file,
        manifestCover: manifestBook.cover ?? null,
      },
      volumes: payload.volumes.map((volume) => ({
        sourceVolumeId: String(volume.id),
        volumeNumber: volume.id,
        title: volume.title ?? null,
        webUrl: volume.webURL ?? null,
        sections: volume.sections.map((section, sectionIndex) => ({
          sourceSectionId: String(section.id),
          sectionNumber: section.id || sectionIndex + 1,
          title: section.title,
          webUrl: section.webURL ?? null,
          chapters: section.chapters.map((chapter, chapterIndex) => ({
            sourceChapterId: String(chapter.id),
            chapterNumber: chapter.id || chapterIndex + 1,
            title: chapter.title,
            contentKind: chapter.contentKind ?? "hadith",
            hadiths: chapter.hadiths.map((hadith, hadithIndex) => {
              const exactKey = gradingLookupKey(payload.bookID, volume.id, section.id, chapter.title, hadithIndex + 1)
              const fallbackSectionKey = gradingLookupKey(payload.bookID, volume.id, 1, chapter.title, hadithIndex + 1)
              const indexedGradings = gradingIndex[exactKey] ?? gradingIndex[fallbackSectionKey] ?? []
              const mergedGradings = dedupeAndSortGradings([
                ...(hadith.allGradings ?? []).map(asNormalizedGrading),
                ...(hadith.grading ? [asNormalizedGrading(hadith.grading)] : []),
                ...indexedGradings,
              ])

              return {
                sourceHadithId: String(hadith.id),
                hadithNumber: hadithIndex + 1,
                arabicText: hadith.arabicText ?? "",
                englishText: hadith.englishText ?? "",
                chain: hadith.chain ?? null,
                sourceUrl: null,
                contentKind: chapter.contentKind ?? "hadith",
                gradings: mergedGradings,
              }
            }),
          })),
        })),
      })),
    })
  }

  return books
}
