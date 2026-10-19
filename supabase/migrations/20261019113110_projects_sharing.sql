-- Projects (a thread of posts about one skill or activity), share links and
-- public pages.
--
-- Anonymous visitors never read tables directly. They go through the
-- SECURITY DEFINER functions at the bottom, which decide exactly which posts a
-- share token or public slug may reveal; the app then only loads those posts.

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------

-- The child's max_visibility caps everything posted on the profile.
create function public.effective_visibility(p_child_id uuid, p_visibility public.visibility)
returns public.visibility
language sql
stable
security definer
set search_path = ''
as $$
  select least(p_visibility, (select max_visibility from public.children where id = p_child_id));
$$;

-- Same check as before, now shared by posts and projects.
create or replace function public.check_post_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility > (select max_visibility from public.children where id = new.child_id) then
    raise exception 'Visibility exceeds the child''s maximum'
      using errcode = 'P0001', hint = 'visibility_exceeds_max';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public page address, chosen by an owner (e.g. /c/mia-chen)
-- ---------------------------------------------------------------------------
alter table public.children
  add column slug extensions.citext unique
    check (slug::text ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' and slug::text !~ '--');

create function public.set_child_slug(p_child_id uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := nullif(lower(btrim(p_slug)), '');
begin
  if not public.has_child_role(p_child_id, 'owner') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if v_slug is not null and (
    v_slug !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'
    or v_slug ~ '--'
    or v_slug in ('admin', 'api', 'app', 'help', 'login', 'new', 'settings', 'signup', 'sprout', 'support', 'www')
  ) then
    raise exception 'Invalid address' using errcode = 'P0001', hint = 'slug_invalid';
  end if;

  begin
    update public.children set slug = v_slug where id = p_child_id;
  exception when unique_violation then
    raise exception 'Address already taken' using errcode = 'P0001', hint = 'slug_taken';
  end;
  return v_slug;
end;
$$;

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  emoji text check (char_length(emoji) <= 16),
  visibility public.visibility not null default 'family',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, child_id)
);

create index projects_child_id_idx on public.projects (child_id, created_at desc);

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create trigger projects_check_visibility
  before insert or update of visibility on public.projects
  for each row execute function public.check_post_visibility();

-- A post may belong to one project of the same child. Deleting the project
-- keeps its posts and just unlinks them.
alter table public.posts
  add column project_id uuid,
  add constraint posts_project_fkey
    foreign key (project_id, child_id) references public.projects (id, child_id)
    on delete set null (project_id);

create index posts_project_idx on public.posts (project_id, occurred_on);

-- ---------------------------------------------------------------------------
-- share_links: an unguessable URL revealing link-or-public content
-- ---------------------------------------------------------------------------
create type public.share_scope as enum ('child', 'project', 'post');

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  scope public.share_scope not null,
  project_id uuid,
  post_id uuid,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  label text check (char_length(label) <= 60),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  foreign key (project_id, child_id) references public.projects (id, child_id) on delete cascade,
  foreign key (post_id, child_id) references public.posts (id, child_id) on delete cascade,
  check (
    (scope = 'child' and project_id is null and post_id is null)
    or (scope = 'project' and project_id is not null and post_id is null)
    or (scope = 'post' and post_id is not null and project_id is null)
  )
);

create index share_links_child_id_idx on public.share_links (child_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Anonymous access
-- ---------------------------------------------------------------------------

-- Validates a share token and records the view. Returns nothing for unknown,
-- revoked, expired tokens, or when the target is no longer shared by link.
create function public.resolve_share(p_token text)
returns table (
  scope public.share_scope,
  child_nickname text,
  child_age_years integer,
  project_title text,
  project_description text,
  project_emoji text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
begin
  select * into v_link from public.share_links l
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now());
  if not found then
    return;
  end if;

  if public.effective_visibility(v_link.child_id, 'public') < 'link'
     or (v_link.scope = 'project' and (
       select public.effective_visibility(p.child_id, p.visibility) from public.projects p where p.id = v_link.project_id
     ) < 'link')
     or (v_link.scope = 'post' and (
       select public.effective_visibility(p.child_id, p.visibility) from public.posts p where p.id = v_link.post_id
     ) < 'link')
  then
    return;
  end if;

  update public.share_links
  set view_count = view_count + 1, last_viewed_at = now()
  where id = v_link.id;

  return query
    select
      v_link.scope,
      c.nickname,
      extract(year from age(current_date, c.birth_date))::integer,
      pr.title,
      pr.description,
      pr.emoji
    from public.children c
    left join public.projects pr on pr.id = v_link.project_id
    where c.id = v_link.child_id;
end;
$$;

-- The posts a share token reveals, in display order, with the project label
-- only when the project itself is shared at least by link.
create function public.shared_post_ids(p_token text, p_limit integer default 20, p_offset integer default 0)
returns table (post_id uuid, project_title text, project_emoji text)
language sql
stable
security definer
set search_path = ''
as $$
  with link as (
    select * from public.share_links l
    where l.token = p_token
      and l.revoked_at is null
      and (l.expires_at is null or l.expires_at > now())
  )
  select
    p.id,
    case when public.effective_visibility(pr.child_id, pr.visibility) >= 'link' then pr.title end,
    case when public.effective_visibility(pr.child_id, pr.visibility) >= 'link' then pr.emoji end
  from link l
  join public.posts p on p.child_id = l.child_id
  left join public.projects pr on pr.id = p.project_id
  where public.effective_visibility(p.child_id, p.visibility) >= 'link'
    and (
      l.scope = 'child'
      or (l.scope = 'post' and p.id = l.post_id)
      or (
        l.scope = 'project'
        and p.project_id = l.project_id
        and public.effective_visibility(pr.child_id, pr.visibility) >= 'link'
      )
    )
  -- Projects read as a journey (oldest first); everything else newest first.
  order by
    case when l.scope = 'project' then p.occurred_on end asc nulls last,
    p.occurred_on desc,
    p.created_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

-- A child's public page exists only when an owner chose an address AND the
-- profile allows public sharing.
create function public.public_child(p_slug text)
returns table (child_nickname text, child_age_years integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.nickname, extract(year from age(current_date, c.birth_date))::integer
  from public.children c
  where c.slug = p_slug::extensions.citext and c.max_visibility = 'public';
$$;

create function public.public_post_ids(p_slug text, p_limit integer default 20, p_offset integer default 0)
returns table (post_id uuid, project_title text, project_emoji text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    case when pr.visibility = 'public' then pr.title end,
    case when pr.visibility = 'public' then pr.emoji end
  from public.children c
  join public.posts p on p.child_id = c.id
  left join public.projects pr on pr.id = p.project_id
  where c.slug = p_slug::extensions.citext
    and c.max_visibility = 'public'
    and p.visibility = 'public'
  order by p.occurred_on desc, p.created_at desc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.projects, public.share_links from anon, authenticated;

grant select, delete on public.projects to authenticated;
grant insert (id, child_id, title, description, emoji, visibility, created_by) on public.projects to authenticated;
grant update (title, description, emoji, visibility) on public.projects to authenticated;

grant insert (project_id), update (project_id) on public.posts to authenticated;

grant select, delete on public.share_links to authenticated;
grant insert (id, child_id, scope, project_id, post_id, label, expires_at, created_by) on public.share_links to authenticated;
grant update (label, revoked_at) on public.share_links to authenticated;

revoke execute on function
  public.effective_visibility(uuid, public.visibility),
  public.set_child_slug(uuid, text),
  public.resolve_share(text),
  public.shared_post_ids(text, integer, integer),
  public.public_child(text),
  public.public_post_ids(text, integer, integer)
  from public;
revoke execute on function
  public.effective_visibility(uuid, public.visibility),
  public.set_child_slug(uuid, text)
  from anon;
grant execute on function
  public.effective_visibility(uuid, public.visibility),
  public.set_child_slug(uuid, text)
  to authenticated;
grant execute on function
  public.resolve_share(text),
  public.shared_post_ids(text, integer, integer),
  public.public_child(text),
  public.public_post_ids(text, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.share_links enable row level security;

create policy "projects: readable per visibility"
  on public.projects for select to authenticated
  using (public.can_read_post(child_id, visibility));

create policy "projects: editors can create"
  on public.projects for insert to authenticated
  with check (public.has_child_role(child_id, 'editor') and created_by = (select auth.uid()));

create policy "projects: editors can update"
  on public.projects for update to authenticated
  using (public.has_child_role(child_id, 'editor'))
  with check (public.has_child_role(child_id, 'editor'));

create policy "projects: editors can delete"
  on public.projects for delete to authenticated
  using (public.has_child_role(child_id, 'editor'));

-- Sharing outside the family is an owner decision.
create policy "share links: owners can read"
  on public.share_links for select to authenticated
  using (public.has_child_role(child_id, 'owner'));

create policy "share links: owners can create"
  on public.share_links for insert to authenticated
  with check (public.has_child_role(child_id, 'owner') and created_by = (select auth.uid()));

create policy "share links: owners can revoke"
  on public.share_links for update to authenticated
  using (public.has_child_role(child_id, 'owner'))
  with check (public.has_child_role(child_id, 'owner'));

create policy "share links: owners can delete"
  on public.share_links for delete to authenticated
  using (public.has_child_role(child_id, 'owner'));
