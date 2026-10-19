-- Posts (moments, milestones, reviews) and their photos/videos.
--
-- Media files never leave storage without a check: the bucket is private, the
-- app signs short-lived URLs with the *user's* client, and the storage policy
-- below only allows that when the user can read the media row (and so the post).

create type public.post_kind as enum ('moment', 'milestone', 'review');
create type public.media_kind as enum ('image', 'video');
create type public.media_status as enum ('pending', 'ready', 'failed');

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  kind public.post_kind not null default 'moment',
  title text check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 5000),
  occurred_on date not null default current_date,
  visibility public.visibility not null default 'family',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets media reference (post_id, child_id) so the two can't disagree.
  unique (id, child_id)
);

create index posts_timeline_idx on public.posts (child_id, occurred_on desc, created_at desc);

create trigger posts_touch_updated_at
  before update on public.posts
  for each row execute function public.touch_updated_at();

-- A post can't be shared more widely than its child's max_visibility.
create function public.check_post_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility > (select max_visibility from public.children where id = new.child_id) then
    raise exception 'Post visibility exceeds the child''s maximum'
      using errcode = 'P0001', hint = 'visibility_exceeds_max';
  end if;
  return new;
end;
$$;

create trigger posts_check_visibility
  before insert or update of visibility on public.posts
  for each row execute function public.check_post_visibility();

-- Owners and editors see everything; viewers see family-or-wider posts. The
-- child's max_visibility also applies to existing posts, so lowering it to
-- "private" immediately hides everything from viewers.
create function public.can_read_post(p_child_id uuid, p_visibility public.visibility)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.child_role(p_child_id)
    when 'owner' then true
    when 'editor' then true
    when 'viewer' then least(
      p_visibility,
      (select max_visibility from public.children where id = p_child_id)
    ) >= 'family'
    else false
  end;
$$;

-- Editors manage their own posts; owners manage every post on the profile.
create function public.can_edit_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and (
        public.has_child_role(p.child_id, 'owner')
        or (p.author_id = (select auth.uid()) and public.has_child_role(p.child_id, 'editor'))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- media
-- ---------------------------------------------------------------------------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  child_id uuid not null,
  uploader_id uuid references public.profiles (id) on delete set null,
  kind public.media_kind not null,
  status public.media_status not null default 'pending',
  position smallint not null default 0,
  -- Images: storage object paths in the "media" bucket.
  storage_path text unique,
  thumb_path text unique,
  width integer,
  height integer,
  -- Bytes charged to the uploader's quota (reserved up front, settled later).
  bytes bigint not null default 0 check (bytes >= 0),
  -- Videos: Mux identifiers.
  mux_upload_id text unique,
  mux_asset_id text unique,
  mux_playback_id text,
  duration_seconds numeric(8, 2),
  error text,
  created_at timestamptz not null default now(),
  foreign key (post_id, child_id) references public.posts (id, child_id) on delete cascade
);

create index media_post_id_idx on public.media (post_id, position);
create index media_child_id_idx on public.media (child_id);

-- Give the bytes back when media goes away (directly or via post/child cascade).
create function public.refund_media_bytes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set storage_used_bytes = greatest(0, storage_used_bytes - old.bytes)
  where id = old.uploader_id;
  return old;
end;
$$;

create trigger media_refund_bytes
  after delete on public.media
  for each row execute function public.refund_media_bytes();

-- Creates a pending media row and reserves quota for it in one step.
create function public.create_media(p_post_id uuid, p_kind public.media_kind, p_bytes bigint)
returns public.media
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_post public.posts;
  v_media public.media;
  v_max_bytes bigint := case p_kind when 'image' then 15 * 1024 * 1024 else 1024 * 1024 * 1024 end;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.can_edit_post(p_post_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_bytes is null or p_bytes <= 0 or p_bytes > v_max_bytes then
    raise exception 'File too large' using errcode = 'P0001', hint = 'file_too_large';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if (select count(*) from public.media where post_id = p_post_id) >= 20 then
    raise exception 'Too many files on this post' using errcode = 'P0001', hint = 'too_many_files';
  end if;

  update public.profiles
  set storage_used_bytes = storage_used_bytes + p_bytes
  where id = v_uid and storage_used_bytes + p_bytes <= storage_quota_bytes;
  if not found then
    raise exception 'Storage quota exceeded' using errcode = 'P0001', hint = 'quota_exceeded';
  end if;

  insert into public.media (post_id, child_id, uploader_id, kind, bytes, position)
  values (
    p_post_id, v_post.child_id, v_uid, p_kind, p_bytes,
    coalesce((select max(position) + 1 from public.media where post_id = p_post_id), 0)
  )
  returning * into v_media;

  if p_kind = 'image' then
    update public.media
    set storage_path = format('%s/%s/full.jpg', v_post.child_id, v_media.id),
        thumb_path = format('%s/%s/thumb.jpg', v_post.child_id, v_media.id)
    where id = v_media.id
    returning * into v_media;
  end if;

  return v_media;
end;
$$;

-- Server-side only: mark media ready and settle the reserved bytes to the real size.
create function public.settle_media(
  p_media_id uuid,
  p_bytes bigint,
  p_width integer default null,
  p_height integer default null,
  p_duration numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.media;
begin
  select * into v_media from public.media where id = p_media_id for update;
  if not found then
    return;
  end if;

  update public.profiles
  set storage_used_bytes = greatest(0, storage_used_bytes + p_bytes - v_media.bytes)
  where id = v_media.uploader_id;

  update public.media
  set status = 'ready',
      bytes = p_bytes,
      width = coalesce(p_width, width),
      height = coalesce(p_height, height),
      duration_seconds = coalesce(p_duration, duration_seconds),
      error = null
  where id = p_media_id;
end;
$$;

-- Server-side only: mark media failed and give its reserved bytes back.
create function public.fail_media(p_media_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.media;
begin
  select * into v_media from public.media where id = p_media_id for update;
  if not found then
    return;
  end if;

  update public.profiles
  set storage_used_bytes = greatest(0, storage_used_bytes - v_media.bytes)
  where id = v_media.uploader_id;

  update public.media
  set status = 'failed', bytes = 0, error = left(p_error, 200)
  where id = p_media_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket (private; JPEG only — the browser re-encodes every photo)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 15728640, array['image/jpeg']);

create policy "media objects: readable with their media row"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    -- public.media is itself under RLS, so this only matches rows the user can read.
    and exists (
      select 1 from public.media m
      where m.storage_path = storage.objects.name or m.thumb_path = storage.objects.name
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.posts, public.media from anon, authenticated;

grant select, delete on public.posts to authenticated;
grant insert (id, child_id, author_id, kind, title, body, occurred_on, visibility) on public.posts to authenticated;
grant update (kind, title, body, occurred_on, visibility) on public.posts to authenticated;

grant select, delete on public.media to authenticated;

revoke execute on function
  public.check_post_visibility(),
  public.can_read_post(uuid, public.visibility),
  public.can_edit_post(uuid),
  public.refund_media_bytes(),
  public.create_media(uuid, public.media_kind, bigint),
  public.settle_media(uuid, bigint, integer, integer, numeric),
  public.fail_media(uuid, text)
  from public, anon;
grant execute on function
  public.can_read_post(uuid, public.visibility),
  public.can_edit_post(uuid),
  public.create_media(uuid, public.media_kind, bigint)
  to authenticated;
revoke execute on function
  public.settle_media(uuid, bigint, integer, integer, numeric),
  public.fail_media(uuid, text)
  from authenticated;
grant execute on function
  public.settle_media(uuid, bigint, integer, integer, numeric),
  public.fail_media(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.media enable row level security;

create policy "posts: readable per visibility"
  on public.posts for select to authenticated
  using (public.can_read_post(child_id, visibility));

create policy "posts: editors can create their own"
  on public.posts for insert to authenticated
  with check (public.has_child_role(child_id, 'editor') and author_id = (select auth.uid()));

create policy "posts: author or owner can update"
  on public.posts for update to authenticated
  using (public.can_edit_post(id))
  with check (public.can_edit_post(id));

create policy "posts: author or owner can delete"
  on public.posts for delete to authenticated
  using (public.can_edit_post(id));

create policy "media: readable with its post"
  on public.media for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "media: post editors can delete"
  on public.media for delete to authenticated
  using (public.can_edit_post(post_id));
