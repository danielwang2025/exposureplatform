-- Growth reports: a saved period (e.g. "Autumn term") with the parent's
-- summary and up to six highlight photos. Statistics and charts are computed
-- when the report is opened, from what the reader is allowed to see.
--
-- Reports are members-only for now: visibility is "private" (guardians) or
-- "family"; there is no share link or public page for them.

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  period_start date not null,
  period_end date not null,
  summary text not null default '' check (char_length(summary) <= 5000),
  highlight_media_ids uuid[] not null default '{}' check (cardinality(highlight_media_ids) <= 6),
  visibility public.visibility not null default 'family' check (visibility in ('private', 'family')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start and period_end - period_start <= 366 * 3),
  unique (id, child_id)
);

create index reports_child_id_idx on public.reports (child_id, period_end desc);

create trigger reports_touch_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

-- Lowering the child's max visibility to "private" also hides reports from
-- viewers (can_read_post applies the cap), but new reports can't exceed it.
create trigger reports_check_visibility
  before insert or update of visibility on public.reports
  for each row execute function public.check_post_visibility();

-- Like posts: the author (while still an editor) or any owner.
create function public.can_edit_report(p_child_id uuid, p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_child_role(p_child_id, 'owner')
    or (p_created_by = (select auth.uid()) and public.has_child_role(p_child_id, 'editor'));
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.reports from anon, authenticated;

grant select, delete on public.reports to authenticated;
grant insert (id, child_id, title, period_start, period_end, summary, highlight_media_ids, visibility, created_by)
  on public.reports to authenticated;
grant update (title, period_start, period_end, summary, highlight_media_ids, visibility)
  on public.reports to authenticated;

revoke execute on function public.can_edit_report(uuid, uuid) from public, anon;
grant execute on function public.can_edit_report(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.reports enable row level security;

create policy "reports: readable per visibility"
  on public.reports for select to authenticated
  using (public.can_read_post(child_id, visibility));

create policy "reports: editors can create their own"
  on public.reports for insert to authenticated
  with check (public.has_child_role(child_id, 'editor') and created_by = (select auth.uid()));

create policy "reports: author or owner can update"
  on public.reports for update to authenticated
  using (public.can_edit_report(child_id, created_by))
  with check (public.can_edit_report(child_id, created_by));

create policy "reports: author or owner can delete"
  on public.reports for delete to authenticated
  using (public.can_edit_report(child_id, created_by));
