-- Teachers: invited by an owner like any member. They write Review posts
-- (with skill ratings and photos) and read only reviews — never the family's
-- moments, milestones, projects or reports.
--
--   viewer  < teacher < editor < owner   (enum order, used by has_child_role)
--
-- Their own reviews are always "family", so the parents and the teacher see
-- them; a teacher can't make a post private (they'd lose it) or share it.

-- ---------------------------------------------------------------------------
-- Invitations may now be for teachers.
-- ---------------------------------------------------------------------------
alter table public.invitations drop constraint invitations_role_check;
alter table public.invitations add constraint invitations_role_check check (role in ('viewer', 'teacher', 'editor'));

-- ---------------------------------------------------------------------------
-- Reading: can_read_post keeps its meaning (teachers get false there, so
-- projects and reports stay hidden); posts get one extra rule for reviews.
-- ---------------------------------------------------------------------------
create function public.teacher_can_read_post(p_child_id uuid, p_visibility public.visibility, p_kind public.post_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.child_role(p_child_id) = 'teacher'
    and p_kind = 'review'
    and public.effective_visibility(p_child_id, p_visibility) >= 'family';
$$;

drop policy "posts: readable per visibility" on public.posts;
create policy "posts: readable per visibility"
  on public.posts for select to authenticated
  using (
    public.can_read_post(child_id, visibility)
    or public.teacher_can_read_post(child_id, visibility, kind)
  );

-- ---------------------------------------------------------------------------
-- Writing: teachers create, edit and delete their own reviews.
-- ---------------------------------------------------------------------------
create policy "posts: teachers can add reviews"
  on public.posts for insert to authenticated
  with check (
    public.child_role(child_id) = 'teacher'
    and author_id = (select auth.uid())
    and kind = 'review'
    and visibility = 'family'
  );

-- Authors who are teachers count as post editors (used by updates, deletes,
-- media uploads and ratings).
create or replace function public.can_edit_post(p_post_id uuid)
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
        or (
          p.author_id = (select auth.uid())
          and (
            public.has_child_role(p.child_id, 'editor')
            or (public.child_role(p.child_id) = 'teacher' and p.kind = 'review')
          )
        )
      )
  );
$$;

-- can_edit_post looks at the row as it was, so this restrictive policy checks
-- the new values: a teacher's post stays a family-visible review with no project.
create policy "posts: teachers keep reviews as reviews"
  on public.posts as restrictive for update to authenticated
  using (true)
  with check (
    public.child_role(child_id) is distinct from 'teacher'
    or (kind = 'review' and visibility = 'family' and project_id is null)
  );

create policy "posts: teachers add only plain reviews"
  on public.posts as restrictive for insert to authenticated
  with check (
    public.child_role(child_id) is distinct from 'teacher'
    or (kind = 'review' and visibility = 'family' and project_id is null)
  );

revoke execute on function public.teacher_can_read_post(uuid, public.visibility, public.post_kind) from public, anon;
grant execute on function public.teacher_can_read_post(uuid, public.visibility, public.post_kind) to authenticated;
