export type SourceName = "hikmah_offline" | "hikmah_data"

export interface NormalizedGrading {
  gradeCode: string | null
  gradeArabic: string | null
  gradeEnglish: string | null
  reference: string
  gradedBy: string
  extra?: Record<string, unknown>
}

export interface NormalizedHadith {
  sourceHadithId: string
  hadithNumber: number
  arabicText: string
  englishText: string
  chain: string | null
  sourceUrl: string | null
  contentKind: string | null
  extra?: Record<string, unknown>
  gradings: NormalizedGrading[]
}

export interface NormalizedChapter {
  sourceChapterId: string
  chapterNumber: number
  title: string
  contentKind: string | null
  extra?: Record<string, unknown>
  hadiths: NormalizedHadith[]
}

export interface NormalizedSection {
  sourceSectionId: string
  sectionNumber: number
  title: string
  webUrl: string | null
  extra?: Record<string, unknown>
  chapters: NormalizedChapter[]
}

export interface NormalizedVolume {
  sourceVolumeId: string
  volumeNumber: number
  title: string | null
  webUrl: string | null
  extra?: Record<string, unknown>
  sections: NormalizedSection[]
}

export interface NormalizedBook {
  sourceName: SourceName
  sourceBookId: string
  slug: string
  workSlug: string | null
  titleArabic: string | null
  titleTranslit: string | null
  englishName: string | null
  subtitle: string | null
  author: string | null
  translator: string | null
  description: string | null
  coverImageUrl: string | null
  category: string | null
  bookUrl: string | null
  extra?: Record<string, unknown>
  volumes: NormalizedVolume[]
}
