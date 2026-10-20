-- Structured skill scores. Each project defines up to 8 skill dimensions
-- (e.g. Piano: rhythm, sight-reading, expression); a post in that project can
-- score each dimension 1–5. Scores are part of the post and follow its
-- visibility.

create table public.skill_dimensions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  child_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (project_id, child_id) references public.projects (id, child_id) on delete cascade
);

create unique index skill_dimensions_name_idx on public.skill_dimensions (project_id, lower(btrim(name)));

-- More than ~8 dimensions stops being readable on one chart.
create function public.limit_skill_dimensions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.skill_dimensions where project_id = new.project_id) >= 8 then
    raise exception 'A project can have at most 8 skills' using errcode = 'P0001', hint = 'too_many_skills';
  end if;
  return new;
end;
$$;

create trigger skill_dimensions_limit
  before insert on public.skill_dimensions
  for each row execute function public.limit_skill_dimensions();

create table public.post_scores (
  post_id uuid not null,
  dimension_id uuid not null,
  project_id uuid not null,
  child_id uuid not null,
  score smallint not null check (score between 1 and 5),
  primary key (post_id, dimension_id),
  foreign key (post_id, child_id) references public.posts (id, child_id) on delete cascade,
  foreign key (dimension_id, project_id) references public.skill_dimensions (id, project_id) on delete cascade
);

create index post_scores_dimension_idx on public.post_scores (dimension_id);

-- A score's dimension must belong to the post's current project.
create function public.check_post_score_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is distinct from (select project_id from public.posts where id = new.post_id) then
    raise exception 'Skill does not belong to this post''s project' using errcode = 'P0001', hint = 'wrong_project';
  end if;
  return new;
end;
$$;

create trigger post_scores_check_project
  before insert or update on public.post_scores
  for each row execute function public.check_post_score_project();

-- Moving a post to another project (or out of one) drops scores that no
-- longer apply.
create function public.drop_scores_on_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_scores
  where post_id = new.id and project_id is distinct from new.project_id;
  return new;
end;
$$;

create trigger posts_drop_scores_on_project_change
  after update of project_id on public.posts
  for each row
  when (old.project_id is distinct from new.project_id)
  execute function public.drop_scores_on_project_change();

-- Replace all scores of a post in one transaction. Runs as the caller, so the
-- RLS policies below decide whether it's allowed.
-- p_scores: {"<dimension uuid>": 1..5, ...}; an empty object clears them.
create function public.set_post_scores(p_post_id uuid, p_scores jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.can_edit_post(p_post_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  delete from public.post_scores where post_id = p_post_id;

  insert into public.post_scores (post_id, dimension_id, project_id, child_id, score)
  select p.id, d.id, d.project_id, p.child_id, (s.value)::smallint
  from jsonb_each_text(coalesce(p_scores, '{}'::jsonb)) as s(key, value)
  join public.skill_dimensions d on d.id = s.key::uuid
  join public.posts p on p.id = p_post_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.skill_dimensions, public.post_scores from anon, authenticated;

grant select, delete on public.skill_dimensions to authenticated;
grant insert (id, project_id, child_id, name, position) on public.skill_dimensions to authenticated;
grant update (name, position) on public.skill_dimensions to authenticated;

grant select, insert, delete on public.post_scores to authenticated;

revoke execute on function
  public.limit_skill_dimensions(),
  public.check_post_score_project(),
  public.drop_scores_on_project_change(),
  public.set_post_scores(uuid, jsonb)
  from public, anon;
grant execute on function public.set_post_scores(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.skill_dimensions enable row level security;
alter table public.post_scores enable row level security;

create policy "skills: readable with the project"
  on public.skill_dimensions for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));

create policy "skills: editors can create"
  on public.skill_dimensions for insert to authenticated
  with check (public.has_child_role(child_id, 'editor'));

create policy "skills: editors can rename"
  on public.skill_dimensions for update to authenticated
  using (public.has_child_role(child_id, 'editor'))
  with check (public.has_child_role(child_id, 'editor'));

create policy "skills: editors can delete"
  on public.skill_dimensions for delete to authenticated
  using (public.has_child_role(child_id, 'editor'));

create policy "scores: readable with the post"
  on public.post_scores for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "scores: post editors can add"
  on public.post_scores for insert to authenticated
  with check (public.can_edit_post(post_id));

create policy "scores: post editors can remove"
  on public.post_scores for delete to authenticated
  using (public.can_edit_post(post_id));
