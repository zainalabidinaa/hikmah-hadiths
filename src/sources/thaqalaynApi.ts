import { dedupeAndSortGradings, mapArabicGradeToCode } from "../lib/grades.js"
import { readJson } from "../lib/io.js"
import { sourceScopedSlug, slugify } from "../lib/slug.js"
import type { NormalizedBook, NormalizedGrading, NormalizedSection } from "../types.js"

interface BookNameRow {
  bookId: string
  bookDescription?: string
  bookCover?: string
  englishName?: string
  translator?: string
  BookName?: string
  author?: string
  idRangeMin?: number
  idRangeMax?: number
  volume?: number
}

interface ThaqalaynRow {
  id: number
  bookId: string
  book: string
  volume: number
  category: string
  categoryId: number
  chapter: string
  author: string
  translator: string
  englishText: string
  arabicText: string
  frenchText?: string
  URL?: string
  mohseniGrading?: string
  behbudiGrading?: string
  majlisiGrading?: string
  chapterInCategoryId?: number
  thaqalaynSanad?: string
  thaqalaynMatn?: string
  gradingsFull?: Array<{
    scholar?: string
    grade_en?: string
    grade_ar?: string
    reference?: string
  }>
}

function extractDataFileId(metadata: BookNameRow): string {
  const match = metadata.bookCover?.match(/\/(\d+)-round\.jpe?g/i)
  if (!match) {
    throw new Error(`Unable to derive Thaqalayn data file id for ${metadata.bookId}`)
  }
  return match[1]
}

function compactHtmlBreaks(value: string): string {
  return value.replace(/<br\s*\/?>/gi, "\n\n").trim()
}

function makeScalarGradings(row: ThaqalaynRow): NormalizedGrading[] {
  const scalarRows = [
    { scholar: "Shaykh Muhammad Asif al-Mohseni", grade_ar: row.mohseniGrading ?? "", grade_en: "", reference: "ThaqalaynAPI scalar grading" },
    { scholar: "Shaykh Baqir al-Behbudi", grade_ar: row.behbudiGrading ?? "", grade_en: "", reference: "ThaqalaynAPI scalar grading" },
    { scholar: "Allamah Baqir al-Majlisi", grade_ar: row.majlisiGrading ?? "", grade_en: "", reference: "ThaqalaynAPI scalar grading" },
  ]

  return scalarRows
    .filter((entry) => entry.grade_ar.trim())
    .map((entry) => ({
      gradeCode: mapArabicGradeToCode(entry.grade_ar),
      gradeArabic: entry.grade_ar,
      gradeEnglish: entry.grade_en || null,
      reference: entry.reference,
      gradedBy: entry.scholar,
    }))
}

function makeGradings(row: ThaqalaynRow): NormalizedGrading[] {
  const expanded = (row.gradingsFull ?? []).map((grading) => ({
    gradeCode: mapArabicGradeToCode(grading.grade_ar ?? null),
    gradeArabic: grading.grade_ar ?? null,
    gradeEnglish: grading.grade_en ?? null,
    reference: grading.reference?.trim() || "Thaqalayn.net",
    gradedBy: grading.scholar?.trim() || "Unspecified scholar",
  }))

  return dedupeAndSortGradings([...expanded, ...makeScalarGradings(row)])
}

function buildSections(rows: ThaqalaynRow[]): NormalizedSection[] {
  const categoryMap = new Map<number, { title: string; rows: ThaqalaynRow[] }>()

  for (const row of rows) {
    if (!categoryMap.has(row.categoryId)) {
      categoryMap.set(row.categoryId, { title: row.category, rows: [] })
    }
    categoryMap.get(row.categoryId)!.rows.push(row)
  }

  return Array.from(categoryMap.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([categoryId, category]) => {
      const chapterGroups = new Map<string, ThaqalaynRow[]>()
      for (const row of category.rows) {
        const chapterKey = `${row.categoryId}::${row.chapter}`
        if (!chapterGroups.has(chapterKey)) {
          chapterGroups.set(chapterKey, [])
        }
        chapterGroups.get(chapterKey)!.push(row)
      }

      const chapters = Array.from(chapterGroups.values()).map((chapterRows, chapterIndex) => ({
        sourceChapterId: `${categoryId}:${chapterIndex + 1}`,
        chapterNumber: chapterIndex + 1,
        title: chapterRows[0]?.chapter ?? `Chapter ${chapterIndex + 1}`,
        contentKind: "hadith",
        extra: {
          categoryId,
        },
        hadiths: chapterRows
          .sort((left, right) => (left.chapterInCategoryId ?? left.id) - (right.chapterInCategoryId ?? right.id))
          .map((row, hadithIndex) => ({
            sourceHadithId: String(row.id),
            hadithNumber: row.chapterInCategoryId ?? hadithIndex + 1,
            arabicText: row.arabicText?.trim() ?? "",
            englishText: compactHtmlBreaks(row.englishText ?? ""),
            chain: row.thaqalaynSanad?.trim() || null,
            sourceUrl: row.URL ?? null,
            contentKind: "hadith",
            extra: {
              frenchText: row.frenchText || null,
              thaqalaynMatn: row.thaqalaynMatn || null,
            },
            gradings: makeGradings(row),
          })),
      }))

      return {
        sourceSectionId: String(categoryId),
        sectionNumber: categoryId,
        title: category.title,
        webUrl: null,
        chapters,
      }
    })
}

export async function loadThaqalaynBooks(source: { localPath?: string; baseUrl?: string }): Promise<NormalizedBook[]> {
  const metadataRows = await readJson<BookNameRow[]>("BookNames.json", source)
  const books: NormalizedBook[] = []

  for (const metadata of metadataRows) {
    const fileId = extractDataFileId(metadata)
    const rows = await readJson<ThaqalaynRow[]>(`${fileId}.json`, source)
    const volumeNumber = metadata.volume ?? rows[0]?.volume ?? 1
    const titleTranslit = metadata.BookName ?? rows[0]?.book ?? metadata.bookId

    books.push({
      sourceName: "thaqalayn_api",
      sourceBookId: metadata.bookId,
      slug: sourceScopedSlug("thaqalayn-api", metadata.bookId),
      workSlug: slugify((metadata.BookName ?? metadata.bookId).replace(/\bvolume\s*\d+\b/gi, "").trim()),
      titleArabic: null,
      titleTranslit,
      englishName: metadata.englishName ?? null,
      subtitle: metadata.englishName ?? null,
      author: metadata.author ?? rows[0]?.author ?? null,
      translator: metadata.translator ?? rows[0]?.translator ?? null,
      description: metadata.bookDescription ?? null,
      coverImageUrl: metadata.bookCover ?? null,
      category: null,
      bookUrl: rows[0]?.URL ? new URL(rows[0].URL).origin : "https://thaqalayn.net",
      extra: {
        dataFileId: fileId,
        idRangeMin: metadata.idRangeMin ?? null,
        idRangeMax: metadata.idRangeMax ?? null,
      },
      volumes: [
        {
          sourceVolumeId: String(volumeNumber),
          volumeNumber,
          title: metadata.volume ? `Volume ${metadata.volume}` : null,
          webUrl: rows[0]?.URL ? `https://thaqalayn.net/book/${fileId}` : null,
          sections: buildSections(rows),
        },
      ],
    })
  }

  return books
}
