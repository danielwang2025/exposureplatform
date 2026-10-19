-- Skills and ratings: each child has their own list of skills (music,
-- reading, ...) and a Review post can rate any of them from 1 to 5.
--
-- A rating lives on its review post, so it inherits that post's visibility,
-- editing rights and deletion. Ratings are members-only: share links and the
-- public page never load them.

-- ---------------------------------------------------------------------------
-- skills
-- ---------------------------------------------------------------------------
create table public.skills (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  emoji text check (char_length(emoji) <= 16),
  position smallint not null default 0,
  -- Archived skills keep their history but can't be rated any more.
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, child_id)
);

create index skills_child_id_idx on public.skills (child_id, position, created_at);
create unique index skills_active_name_idx on public.skills (child_id, lower(btrim(name))) where archived_at is null;

create trigger skills_touch_updated_at
  before update on public.skills
  for each row execute function public.touch_updated_at();

-- At most 12 active skills per child keeps the radar chart readable.
create function public.check_active_skills()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is null and (
    select count(*) from public.skills
    where child_id = new.child_id and archived_at is null and id <> new.id
  ) >= 12 then
    raise exception 'A child can have at most 12 active skills'
      using errcode = 'P0001', hint = 'too_many_skills';
  end if;
  return new;
end;
$$;

create trigger skills_check_active
  before insert or update of archived_at on public.skills
  for each row execute function public.check_active_skills();

-- ---------------------------------------------------------------------------
-- skill_ratings
-- ---------------------------------------------------------------------------
create table public.skill_ratings (
  post_id uuid not null,
  child_id uuid not null,
  skill_id uuid not null,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (post_id, skill_id),
  -- Composite keys guarantee the post and the skill belong to the same child.
  foreign key (post_id, child_id) references public.posts (id, child_id) on delete cascade,
  foreign key (skill_id, child_id) references public.skills (id, child_id) on delete cascade
);

create index skill_ratings_skill_idx on public.skill_ratings (skill_id);

-- Only review posts carry ratings, and only active skills can be newly rated.
create function public.check_skill_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select kind from public.posts where id = new.post_id) <> 'review' then
    raise exception 'Only review posts can rate skills'
      using errcode = 'P0001', hint = 'not_a_review';
  end if;
  -- INSERT ... ON CONFLICT also lands here, so an existing rating may stay.
  if tg_op = 'INSERT'
    and (select archived_at from public.skills where id = new.skill_id) is not null
    and not exists (
      select 1 from public.skill_ratings where post_id = new.post_id and skill_id = new.skill_id
    ) then
    raise exception 'This skill is archived'
      using errcode = 'P0001', hint = 'skill_archived';
  end if;
  return new;
end;
$$;

create trigger skill_ratings_check
  before insert or update on public.skill_ratings
  for each row execute function public.check_skill_rating();

-- Turning a review into a moment or milestone drops its ratings.
create function public.drop_ratings_off_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.skill_ratings where post_id = new.id;
  return null;
end;
$$;

create trigger posts_drop_ratings_off_review
  after update of kind on public.posts
  for each row when (new.kind <> 'review' and old.kind = 'review')
  execute function public.drop_ratings_off_review();

-- Replaces a post's ratings in one go: p_ratings maps skill id -> score.
-- SECURITY INVOKER, so every statement runs under the caller's RLS.
create function public.set_post_ratings(p_post_id uuid, p_ratings jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_child_id uuid;
begin
  select child_id into v_child_id from public.posts where id = p_post_id;
  if v_child_id is null or not public.can_edit_post(p_post_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ratings) <> 'object' then
    raise exception 'Ratings must be an object' using errcode = '22023';
  end if;

  delete from public.skill_ratings r
  where r.post_id = p_post_id
    and not (p_ratings ? r.skill_id::text);

  insert into public.skill_ratings (post_id, child_id, skill_id, score)
  select p_post_id, v_child_id, key::uuid, value::smallint
  from jsonb_each_text(p_ratings)
  on conflict (post_id, skill_id) do update
    set score = excluded.score
    where public.skill_ratings.score is distinct from excluded.score;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.skills, public.skill_ratings from anon, authenticated;

grant select, delete on public.skills to authenticated;
grant insert (id, child_id, name, emoji, position, created_by) on public.skills to authenticated;
grant update (name, emoji, position, archived_at) on public.skills to authenticated;

grant select, delete on public.skill_ratings to authenticated;
grant insert (post_id, child_id, skill_id, score) on public.skill_ratings to authenticated;
grant update (score) on public.skill_ratings to authenticated;

revoke execute on function
  public.check_active_skills(),
  public.check_skill_rating(),
  public.drop_ratings_off_review(),
  public.set_post_ratings(uuid, jsonb)
  from public, anon;
grant execute on function public.set_post_ratings(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.skills enable row level security;
alter table public.skill_ratings enable row level security;

create policy "skills: readable by members"
  on public.skills for select to authenticated
  using (public.has_child_role(child_id, 'viewer'));

create policy "skills: editors can create"
  on public.skills for insert to authenticated
  with check (public.has_child_role(child_id, 'editor') and created_by = (select auth.uid()));

create policy "skills: editors can update"
  on public.skills for update to authenticated
  using (public.has_child_role(child_id, 'editor'))
  with check (public.has_child_role(child_id, 'editor'));

-- Deleting a skill erases its history, so only owners can; editors archive.
create policy "skills: owners can delete"
  on public.skills for delete to authenticated
  using (public.has_child_role(child_id, 'owner'));

-- "Can read the post" via a subquery on posts, which is itself under RLS.
create policy "ratings: readable with the post"
  on public.skill_ratings for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "ratings: post editors can add"
  on public.skill_ratings for insert to authenticated
  with check (public.can_edit_post(post_id));

create policy "ratings: post editors can change"
  on public.skill_ratings for update to authenticated
  using (public.can_edit_post(post_id))
  with check (public.can_edit_post(post_id));

create policy "ratings: post editors can remove"
  on public.skill_ratings for delete to authenticated
  using (public.can_edit_post(post_id));
