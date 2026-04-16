create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.books (
  id bigint generated always as identity primary key,
  slug text not null unique,
  source_name text not null check (source_name in ('hikmah_offline', 'thaqalayn_api')),
  source_book_id text not null,
  work_slug text,
  title_arabic text,
  title_translit text,
  english_name text,
  subtitle text,
  author text,
  translator text,
  description text,
  cover_image_url text,
  category text,
  book_url text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_name, source_book_id)
);

create table if not exists public.volumes (
  id bigint generated always as identity primary key,
  book_id bigint not null references public.books(id) on delete cascade,
  source_volume_id text not null,
  volume_number integer not null,
  title text,
  web_url text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (book_id, source_volume_id),
  unique (book_id, volume_number)
);

create table if not exists public.sections (
  id bigint generated always as identity primary key,
  volume_id bigint not null references public.volumes(id) on delete cascade,
  source_section_id text not null,
  section_number integer not null,
  title text not null,
  web_url text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (volume_id, source_section_id),
  unique (volume_id, section_number)
);

create table if not exists public.chapters (
  id bigint generated always as identity primary key,
  section_id bigint not null references public.sections(id) on delete cascade,
  source_chapter_id text not null,
  chapter_number integer not null,
  title text not null,
  content_kind text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (section_id, source_chapter_id),
  unique (section_id, chapter_number)
);

create table if not exists public.hadiths (
  id bigint generated always as identity primary key,
  chapter_id bigint not null references public.chapters(id) on delete cascade,
  source_hadith_id text not null,
  hadith_number integer not null,
  arabic_text text not null default '',
  english_text text not null default '',
  chain text,
  source_url text,
  content_kind text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (chapter_id, source_hadith_id),
  unique (chapter_id, hadith_number)
);

create table if not exists public.gradings (
  id bigint generated always as identity primary key,
  hadith_id bigint not null references public.hadiths(id) on delete cascade,
  grade_code text,
  grade_ar text,
  grade_en text,
  reference text not null,
  graded_by text not null,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists books_source_name_idx on public.books(source_name);
create index if not exists books_work_slug_idx on public.books(work_slug);
create index if not exists volumes_book_number_idx on public.volumes(book_id, volume_number);
create index if not exists sections_volume_number_idx on public.sections(volume_id, section_number);
create index if not exists chapters_section_number_idx on public.chapters(section_id, chapter_number);
create index if not exists hadiths_chapter_number_idx on public.hadiths(chapter_id, hadith_number);
create index if not exists gradings_hadith_id_idx on public.gradings(hadith_id);
create unique index if not exists gradings_unique_idx on public.gradings(hadith_id, coalesce(grade_code, ''), reference, graded_by);

drop trigger if exists books_set_updated_at on public.books;
create trigger books_set_updated_at before update on public.books for each row execute function public.set_updated_at();

drop trigger if exists volumes_set_updated_at on public.volumes;
create trigger volumes_set_updated_at before update on public.volumes for each row execute function public.set_updated_at();

drop trigger if exists sections_set_updated_at on public.sections;
create trigger sections_set_updated_at before update on public.sections for each row execute function public.set_updated_at();

drop trigger if exists chapters_set_updated_at on public.chapters;
create trigger chapters_set_updated_at before update on public.chapters for each row execute function public.set_updated_at();

drop trigger if exists hadiths_set_updated_at on public.hadiths;
create trigger hadiths_set_updated_at before update on public.hadiths for each row execute function public.set_updated_at();

drop trigger if exists gradings_set_updated_at on public.gradings;
create trigger gradings_set_updated_at before update on public.gradings for each row execute function public.set_updated_at();

alter table public.books enable row level security;
alter table public.volumes enable row level security;
alter table public.sections enable row level security;
alter table public.chapters enable row level security;
alter table public.hadiths enable row level security;
alter table public.gradings enable row level security;

drop policy if exists books_public_read on public.books;
create policy books_public_read on public.books for select to anon, authenticated using (true);

drop policy if exists volumes_public_read on public.volumes;
create policy volumes_public_read on public.volumes for select to anon, authenticated using (true);

drop policy if exists sections_public_read on public.sections;
create policy sections_public_read on public.sections for select to anon, authenticated using (true);

drop policy if exists chapters_public_read on public.chapters;
create policy chapters_public_read on public.chapters for select to anon, authenticated using (true);

drop policy if exists hadiths_public_read on public.hadiths;
create policy hadiths_public_read on public.hadiths for select to anon, authenticated using (true);

drop policy if exists gradings_public_read on public.gradings;
create policy gradings_public_read on public.gradings for select to anon, authenticated using (true);

create or replace function public.get_books_catalog(source_filter text default null)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slug', b.slug,
        'sourceName', b.source_name,
        'sourceBookId', b.source_book_id,
        'workSlug', b.work_slug,
        'titleArabic', b.title_arabic,
        'titleTranslit', b.title_translit,
        'englishName', b.english_name,
        'subtitle', b.subtitle,
        'author', b.author,
        'translator', b.translator,
        'description', b.description,
        'coverImageURL', b.cover_image_url,
        'category', b.category,
        'bookURL', b.book_url,
        'volumeCount', coalesce((select count(*) from public.volumes v where v.book_id = b.id), 0)
      )
      order by b.title_translit nulls last, b.slug
    ),
    '[]'::jsonb
  )
  from public.books b
  where source_filter is null or b.source_name = source_filter;
$$;

create or replace function public.get_book_overview(book_slug text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'slug', b.slug,
    'sourceName', b.source_name,
    'sourceBookId', b.source_book_id,
    'workSlug', b.work_slug,
    'titleArabic', b.title_arabic,
    'titleTranslit', b.title_translit,
    'englishName', b.english_name,
    'subtitle', b.subtitle,
    'author', b.author,
    'translator', b.translator,
    'description', b.description,
    'coverImageURL', b.cover_image_url,
    'category', b.category,
    'bookURL', b.book_url,
    'extra', b.extra,
    'volumes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', v.volume_number,
            'sourceVolumeId', v.source_volume_id,
            'title', v.title,
            'webURL', v.web_url,
            'extra', v.extra,
            'sectionCount', coalesce((select count(*) from public.sections s where s.volume_id = v.id), 0)
          )
          order by v.volume_number
        )
        from public.volumes v
        where v.book_id = b.id
      ),
      '[]'::jsonb
    )
  )
  from public.books b
  where b.slug = book_slug;
$$;

create or replace function public.get_book_volume(book_slug text, volume_number integer)
returns jsonb
language sql
stable
as $$
  with target_book as (
    select * from public.books where slug = book_slug limit 1
  ),
  target_volume as (
    select v.*
    from public.volumes v
    join target_book b on b.id = v.book_id
    where v.volume_number = get_book_volume.volume_number
    limit 1
  )
  select jsonb_build_object(
    'book', (
      select jsonb_build_object(
        'slug', b.slug,
        'sourceName', b.source_name,
        'sourceBookId', b.source_book_id,
        'workSlug', b.work_slug,
        'titleArabic', b.title_arabic,
        'titleTranslit', b.title_translit,
        'englishName', b.english_name,
        'subtitle', b.subtitle,
        'author', b.author,
        'translator', b.translator,
        'description', b.description,
        'coverImageURL', b.cover_image_url,
        'category', b.category,
        'bookURL', b.book_url,
        'extra', b.extra
      )
      from target_book b
    ),
    'volume', (
      select jsonb_build_object(
        'id', v.volume_number,
        'sourceVolumeId', v.source_volume_id,
        'title', v.title,
        'webURL', v.web_url,
        'extra', v.extra,
        'sections', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', s.section_number,
                'sourceSectionId', s.source_section_id,
                'title', s.title,
                'webURL', s.web_url,
                'extra', s.extra,
                'chapters', coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', c.chapter_number,
                        'sourceChapterId', c.source_chapter_id,
                        'title', c.title,
                        'contentKind', c.content_kind,
                        'extra', c.extra,
                        'hadiths', coalesce(
                          (
                            select jsonb_agg(
                              jsonb_build_object(
                                'id', h.hadith_number,
                                'sourceHadithId', h.source_hadith_id,
                                'arabicText', h.arabic_text,
                                'englishText', h.english_text,
                                'chain', h.chain,
                                'sourceURL', h.source_url,
                                'contentKind', h.content_kind,
                                'extra', h.extra,
                                'gradings', coalesce(
                                  (
                                    select jsonb_agg(
                                      jsonb_build_object(
                                        'gradeCode', g.grade_code,
                                        'gradeArabic', g.grade_ar,
                                        'gradeEnglish', g.grade_en,
                                        'reference', g.reference,
                                        'gradedBy', g.graded_by,
                                        'extra', g.extra
                                      )
                                      order by g.id
                                    )
                                    from public.gradings g
                                    where g.hadith_id = h.id
                                  ),
                                  '[]'::jsonb
                                )
                              )
                              order by h.hadith_number
                            )
                            from public.hadiths h
                            where h.chapter_id = c.id
                          ),
                          '[]'::jsonb
                        )
                      )
                      order by c.chapter_number
                    )
                    from public.chapters c
                    where c.section_id = s.id
                  ),
                  '[]'::jsonb
                )
              )
              order by s.section_number
            )
            from public.sections s
            where s.volume_id = v.id
          ),
          '[]'::jsonb
        )
      )
      from target_volume v
    )
  );
$$;

grant usage on schema public to anon, authenticated;
grant select on public.books, public.volumes, public.sections, public.chapters, public.hadiths, public.gradings to anon, authenticated;
grant execute on function public.get_books_catalog(text) to anon, authenticated;
grant execute on function public.get_book_overview(text) to anon, authenticated;
grant execute on function public.get_book_volume(text, integer) to anon, authenticated;
