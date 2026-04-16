import "dotenv/config"

import { createClient } from "@supabase/supabase-js"
import { requireEnv, optionalEnv, resolveSourceLocation } from "./lib/env.js"
import { loadAppOfflineBooks } from "./sources/appOffline.js"
import { loadHikmahDataBooks } from "./sources/hikmahApi.js"
import type { NormalizedBook, SourceName } from "./types.js"

type TableName = "books" | "volumes" | "sections" | "chapters" | "hadiths" | "gradings"
type SupabaseClientAny = any

function chunk<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

async function insertRows<T extends object>(
  supabase: SupabaseClientAny,
  table: TableName,
  rows: T[],
  select: string,
  chunkSize: number,
): Promise<any[]> {
  if (rows.length === 0) {
    return []
  }

  const inserted: any[] = []
  for (const batch of chunk(rows, chunkSize)) {
    const { data, error } = await (supabase.from(table as never) as any).insert(batch).select(select)
    if (error) {
      throw new Error(`Failed inserting into ${table}: ${error.message}`)
    }
    inserted.push(...(data ?? []))
  }
  return inserted
}

async function replaceSourceBooks(supabase: SupabaseClientAny, sourceName: SourceName): Promise<void> {
  const { error } = await (supabase.from("books" as never) as any).delete().eq("source_name", sourceName)
  if (error) {
    throw new Error(`Failed clearing books for ${sourceName}: ${error.message}`)
  }
}

async function importSourceBooks(supabase: SupabaseClientAny, books: NormalizedBook[], sourceName: SourceName): Promise<void> {
  console.log(`Importing ${books.length} books from ${sourceName}...`)
  await replaceSourceBooks(supabase, sourceName)

  const insertedBooks = await insertRows(
    supabase,
    "books",
    books.map((book) => ({
      slug: book.slug,
      source_name: book.sourceName,
      source_book_id: book.sourceBookId,
      work_slug: book.workSlug,
      title_arabic: book.titleArabic,
      title_translit: book.titleTranslit,
      english_name: book.englishName,
      subtitle: book.subtitle,
      author: book.author,
      translator: book.translator,
      description: book.description,
      cover_image_url: book.coverImageUrl,
      category: book.category,
      book_url: book.bookUrl,
      extra: book.extra ?? {},
    })),
    "id, slug",
    250,
  )

  const bookIds = new Map(insertedBooks.map((row) => [row.slug as string, row.id as number]))

  const volumeSeed = books.flatMap((book) =>
    book.volumes.map((volume) => ({
      slug: book.slug,
      source_volume_id: volume.sourceVolumeId,
      volume_number: volume.volumeNumber,
      title: volume.title,
      web_url: volume.webUrl,
      extra: volume.extra ?? {},
    })),
  )

  const insertedVolumes = await insertRows(
    supabase,
    "volumes",
    volumeSeed.map((volume) => ({
      book_id: bookIds.get(volume.slug),
      source_volume_id: volume.source_volume_id,
      volume_number: volume.volume_number,
      title: volume.title,
      web_url: volume.web_url,
      extra: volume.extra,
    })),
    "id, book_id, source_volume_id",
    500,
  )

  const volumeIds = new Map(insertedVolumes.map((row) => [`${row.book_id}|${row.source_volume_id}`, row.id as number]))

  const sectionSeed = books.flatMap((book) =>
    book.volumes.flatMap((volume) =>
      volume.sections.map((section) => ({
        bookSlug: book.slug,
        volumeSourceId: volume.sourceVolumeId,
        source_section_id: section.sourceSectionId,
        section_number: section.sectionNumber,
        title: section.title,
        web_url: section.webUrl,
        extra: section.extra ?? {},
      })),
    ),
  )

  const insertedSections = await insertRows(
    supabase,
    "sections",
    sectionSeed.map((section) => ({
      volume_id: volumeIds.get(`${bookIds.get(section.bookSlug)}|${section.volumeSourceId}`),
      source_section_id: section.source_section_id,
      section_number: section.section_number,
      title: section.title,
      web_url: section.web_url,
      extra: section.extra,
    })),
    "id, volume_id, source_section_id",
    1000,
  )

  const sectionIds = new Map(insertedSections.map((row) => [`${row.volume_id}|${row.source_section_id}`, row.id as number]))

  const chapterSeed = books.flatMap((book) =>
    book.volumes.flatMap((volume) =>
      volume.sections.flatMap((section) =>
        section.chapters.map((chapter) => ({
          bookSlug: book.slug,
          volumeSourceId: volume.sourceVolumeId,
          sectionSourceId: section.sourceSectionId,
          source_chapter_id: chapter.sourceChapterId,
          chapter_number: chapter.chapterNumber,
          title: chapter.title,
          content_kind: chapter.contentKind,
          extra: chapter.extra ?? {},
        })),
      ),
    ),
  )

  const insertedChapters = await insertRows(
    supabase,
    "chapters",
    chapterSeed.map((chapter) => {
      const bookId = bookIds.get(chapter.bookSlug)
      const volumeId = volumeIds.get(`${bookId}|${chapter.volumeSourceId}`)
      return {
        section_id: sectionIds.get(`${volumeId}|${chapter.sectionSourceId}`),
        source_chapter_id: chapter.source_chapter_id,
        chapter_number: chapter.chapter_number,
        title: chapter.title,
        content_kind: chapter.content_kind,
        extra: chapter.extra,
      }
    }),
    "id, section_id, source_chapter_id",
    1000,
  )

  const chapterIds = new Map(insertedChapters.map((row) => [`${row.section_id}|${row.source_chapter_id}`, row.id as number]))

  const hadithSeed = books.flatMap((book) =>
    book.volumes.flatMap((volume) =>
      volume.sections.flatMap((section) =>
        section.chapters.flatMap((chapter) =>
          chapter.hadiths.map((hadith) => ({
            bookSlug: book.slug,
            volumeSourceId: volume.sourceVolumeId,
            sectionSourceId: section.sourceSectionId,
            chapterSourceId: chapter.sourceChapterId,
            source_hadith_id: hadith.sourceHadithId,
            hadith_number: hadith.hadithNumber,
            arabic_text: hadith.arabicText,
            english_text: hadith.englishText,
            chain: hadith.chain,
            source_url: hadith.sourceUrl,
            content_kind: hadith.contentKind,
            extra: hadith.extra ?? {},
            gradings: hadith.gradings,
          })),
        ),
      ),
    ),
  )

  const insertedHadiths = await insertRows(
    supabase,
    "hadiths",
    hadithSeed.map((hadith) => {
      const bookId = bookIds.get(hadith.bookSlug)
      const volumeId = volumeIds.get(`${bookId}|${hadith.volumeSourceId}`)
      const sectionId = sectionIds.get(`${volumeId}|${hadith.sectionSourceId}`)
      return {
        chapter_id: chapterIds.get(`${sectionId}|${hadith.chapterSourceId}`),
        source_hadith_id: hadith.source_hadith_id,
        hadith_number: hadith.hadith_number,
        arabic_text: hadith.arabic_text,
        english_text: hadith.english_text,
        chain: hadith.chain,
        source_url: hadith.source_url,
        content_kind: hadith.content_kind,
        extra: hadith.extra,
      }
    }),
    "id, chapter_id, source_hadith_id",
    1000,
  )

  const hadithIds = new Map(insertedHadiths.map((row) => [`${row.chapter_id}|${row.source_hadith_id}`, row.id as number]))

  const gradingSeed = hadithSeed.flatMap((hadith) =>
    hadith.gradings.map((grading) => ({ ...grading, hadith })),
  )

  await insertRows(
    supabase,
    "gradings",
    gradingSeed.map((entry) => {
      const hadith = entry.hadith
      const bookId = bookIds.get(hadith.bookSlug)
      const volumeId = volumeIds.get(`${bookId}|${hadith.volumeSourceId}`)
      const sectionId = sectionIds.get(`${volumeId}|${hadith.sectionSourceId}`)
      const chapterId = chapterIds.get(`${sectionId}|${hadith.chapterSourceId}`)
      return {
        hadith_id: hadithIds.get(`${chapterId}|${hadith.source_hadith_id}`),
        grade_code: entry.gradeCode,
        grade_ar: entry.gradeArabic,
        grade_en: entry.gradeEnglish,
        reference: entry.reference,
        graded_by: entry.gradedBy,
        extra: entry.extra ?? {},
      }
    }),
    "id",
    1000,
  )

  const volumeCount = volumeSeed.length
  const sectionCount = sectionSeed.length
  const chapterCount = chapterSeed.length
  const hadithCount = hadithSeed.length
  const gradingCount = gradingSeed.length
  console.log(`Imported ${sourceName}: ${books.length} books, ${volumeCount} volumes, ${sectionCount} sections, ${chapterCount} chapters, ${hadithCount} hadiths, ${gradingCount} gradings.`)
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "all"
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const hikmahDataSource = resolveSourceLocation(
    optionalEnv("HIKMAH_DATA_PATH"),
    optionalEnv("HIKMAH_DATA_BASE_URL") ?? "https://raw.githubusercontent.com/MohammedArab1/ThaqalaynAPI/main/V2/ThaqalaynData/",
  )
  const hikmahSource = resolveSourceLocation(
    optionalEnv("HIKMAH_HADITH_PATH"),
    optionalEnv("HIKMAH_HADITH_BASE_URL"),
  )

  if (mode === "hikmah-data" || mode === "all") {
    const books = await loadHikmahDataBooks(hikmahDataSource)
    await importSourceBooks(supabase, books, "hikmah_data")
  }

  if (mode === "app-offline" || mode === "all") {
    const books = await loadAppOfflineBooks(hikmahSource)
    await importSourceBooks(supabase, books, "hikmah_offline")
  }

  if (!["hikmah-data", "app-offline", "all"].includes(mode)) {
    throw new Error(`Unknown import mode: ${mode}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
