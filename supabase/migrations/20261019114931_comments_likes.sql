-- Comments and likes: for signed-in family members only. Visitors arriving
-- through a share link or public page can't read or write either, so there is
-- nothing public to moderate.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  child_id uuid not null,
  -- Deleting an account deletes that person's comments.
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (post_id, child_id) references public.posts (id, child_id) on delete cascade
);

create index comments_post_id_idx on public.comments (post_id, created_at);

create trigger comments_touch_updated_at
  before update on public.comments
  for each row execute function public.touch_updated_at();

create table public.post_likes (
  post_id uuid not null,
  child_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id),
  foreign key (post_id, child_id) references public.posts (id, child_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.comments, public.post_likes from anon, authenticated;

grant select, delete on public.comments to authenticated;
grant insert (id, post_id, child_id, author_id, body) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;

grant select, insert, delete on public.post_likes to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security. "Can read the post" is expressed as a subquery on
-- posts, which is itself under RLS for the current user.
-- ---------------------------------------------------------------------------
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;

create policy "comments: readable with the post"
  on public.comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "comments: members who can read the post can comment"
  on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id and p.child_id = comments.child_id)
  );

create policy "comments: authors can edit"
  on public.comments for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- Owners can remove anything said on their child's profile.
create policy "comments: authors and owners can delete"
  on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.has_child_role(child_id, 'owner'));

create policy "likes: readable with the post"
  on public.post_likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy "likes: members who can read the post can like"
  on public.post_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id and p.child_id = post_likes.child_id)
  );

create policy "likes: remove your own"
  on public.post_likes for delete to authenticated
  using (user_id = (select auth.uid()));
