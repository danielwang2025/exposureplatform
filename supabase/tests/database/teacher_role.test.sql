-- Teachers read and write reviews only; the family's other content stays hidden.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a7', 'owner7@example.com',    '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b7', 'editor7@example.com',   '{"display_name":"Editor"}'),
  ('00000000-0000-0000-0000-0000000000c7', 'viewer7@example.com',   '{"display_name":"Viewer"}'),
  ('00000000-0000-0000-0000-0000000000e7', 'teacher7@example.com',  '{"display_name":"Teacher"}'),
  ('00000000-0000-0000-0000-0000000000f7', 'teacher7b@example.com', '{"display_name":"Other teacher"}');

insert into public.children (id, nickname, max_visibility, created_by) values
  ('a7000000-0000-0000-0000-000000000001', 'Max', 'public', '00000000-0000-0000-0000-0000000000a7'),
  ('a7000000-0000-0000-0000-000000000002', 'Elsewhere', 'family', '00000000-0000-0000-0000-0000000000a7');
insert into public.child_members (child_id, user_id, role) values
  ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a7', 'owner'),
  ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b7', 'editor'),
  ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c7', 'viewer'),
  ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'teacher'),
  ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f7', 'teacher'),
  ('a7000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a7', 'owner');

insert into public.projects (id, child_id, title, visibility) values
  ('b7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'Piano', 'family');
insert into public.posts (id, child_id, author_id, kind, title, visibility) values
  ('c7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a7', 'moment', 'Beach day', 'family'),
  ('c7000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a7', 'milestone', 'First tooth', 'public'),
  ('c7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a7', 'review', 'Parent review', 'family'),
  ('c7000000-0000-0000-0000-000000000004', 'a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a7', 'review', 'Private review', 'private'),
  ('c7000000-0000-0000-0000-000000000009', 'a7000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a7', 'review', 'Other child', 'family');
insert into public.reports (child_id, title, period_start, period_end, visibility) values
  ('a7000000-0000-0000-0000-000000000001', 'Family report', '2026-01-01', '2026-12-31', 'family');
insert into public.skills (id, child_id, name) values
  ('d7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'Reading');

create function pg_temp.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- ---------------------------------------------------------------------------
-- What a teacher can read
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e7');
select results_eq(
  $$ select title from public.posts order by title $$,
  $$ values ('Parent review') $$,
  'teacher reads family reviews only — no moments, milestones or private reviews');
select is((select count(*)::int from public.projects), 0, 'teacher reads no projects');
select is((select count(*)::int from public.reports), 0, 'teacher reads no reports');
select is((select count(*)::int from public.skills), 1, 'teacher reads the child''s skills');
select is((select count(*)::int from public.children), 1, 'teacher sees only their own child');
select is((select count(*)::int from public.posts where child_id = 'a7000000-0000-0000-0000-000000000002'), 0,
  'teacher reads nothing of other children');

-- ---------------------------------------------------------------------------
-- What a teacher can write
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.posts (id, child_id, author_id, kind, title, visibility) values
     ('c7000000-0000-0000-0000-000000000010', 'a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'review', 'Term 1 review', 'family') $$,
  'teacher can write a family review');
select throws_ok(
  $$ insert into public.posts (child_id, author_id, kind, title, visibility) values
     ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'moment', 'A moment', 'family') $$,
  '42501', null, 'teacher cannot write moments');
select throws_ok(
  $$ insert into public.posts (child_id, author_id, kind, title, visibility) values
     ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'review', 'Shared', 'public') $$,
  '42501', null, 'teacher reviews cannot be public');
select throws_ok(
  $$ insert into public.posts (child_id, author_id, kind, title, visibility) values
     ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'review', 'Hidden', 'private') $$,
  '42501', null, 'teacher reviews cannot be private');
select throws_ok(
  $$ insert into public.posts (child_id, author_id, kind, title, visibility, project_id) values
     ('a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'review', 'In a project', 'family', 'b7000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'teacher reviews cannot join a project');
select throws_ok(
  $$ insert into public.posts (child_id, author_id, kind, title, visibility) values
     ('a7000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e7', 'review', 'Wrong child', 'family') $$,
  '42501', null, 'teacher cannot post on another child');
select lives_ok(
  $$ select public.set_post_ratings('c7000000-0000-0000-0000-000000000010', '{"d7000000-0000-0000-0000-000000000001": 3}') $$,
  'teacher can rate skills on their review');
select lives_ok(
  $$ select public.create_media('c7000000-0000-0000-0000-000000000010', 'image', 1000) $$,
  'teacher can add a photo to their review');
select lives_ok(
  $$ update public.posts set title = 'Term 1 review (edited)' where id = 'c7000000-0000-0000-0000-000000000010' $$,
  'teacher can edit their review');
select throws_ok(
  $$ update public.posts set kind = 'moment' where id = 'c7000000-0000-0000-0000-000000000010' $$,
  '42501', null, 'teacher cannot turn a review into a moment');
select throws_ok(
  $$ update public.posts set visibility = 'public' where id = 'c7000000-0000-0000-0000-000000000010' $$,
  '42501', null, 'teacher cannot widen a review''s visibility');
update public.posts set title = 'Hijacked' where id = 'c7000000-0000-0000-0000-000000000003';
select throws_ok(
  $$ select public.set_post_ratings('c7000000-0000-0000-0000-000000000003', '{}') $$,
  '42501', null, 'teacher cannot rate a parent''s review');
select lives_ok(
  $$ insert into public.comments (post_id, child_id, author_id, body) values
     ('c7000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'Agreed!') $$,
  'teacher can comment on a review');
select throws_ok(
  $$ insert into public.comments (post_id, child_id, author_id, body) values
     ('c7000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e7', 'Nice beach') $$,
  '42501', null, 'teacher cannot comment on a moment they cannot see');
select throws_ok(
  $$ insert into public.skills (child_id, name, created_by) values
     ('a7000000-0000-0000-0000-000000000001', 'Art', '00000000-0000-0000-0000-0000000000e7') $$,
  '42501', null, 'teacher cannot add skills');
select throws_ok(
  $$ insert into public.reports (child_id, title, period_start, period_end, created_by) values
     ('a7000000-0000-0000-0000-000000000001', 'Mine', '2026-01-01', '2026-02-01', '00000000-0000-0000-0000-0000000000e7') $$,
  '42501', null, 'teacher cannot create reports');
select pg_temp.logout();
select is((select title from public.posts where id = 'c7000000-0000-0000-0000-000000000003'), 'Parent review',
  'teacher cannot edit a parent''s review');

-- Another teacher reads the review but can't edit it.
select pg_temp.login('00000000-0000-0000-0000-0000000000f7');
select is((select count(*)::int from public.posts where id = 'c7000000-0000-0000-0000-000000000010'), 1,
  'other teacher reads the review');
delete from public.posts where id = 'c7000000-0000-0000-0000-000000000010';
select pg_temp.logout();
select is((select count(*)::int from public.posts where id = 'c7000000-0000-0000-0000-000000000010'), 1,
  'other teacher cannot delete it');

-- The family sees the teacher's review and its rating.
select pg_temp.login('00000000-0000-0000-0000-0000000000c7');
select is((select count(*)::int from public.skill_ratings where post_id = 'c7000000-0000-0000-0000-000000000010'), 1,
  'viewer sees the teacher''s rating');
select pg_temp.logout();

-- Owners stay in charge.
select pg_temp.login('00000000-0000-0000-0000-0000000000a7');
select lives_ok(
  $$ update public.posts set visibility = 'private' where id = 'c7000000-0000-0000-0000-000000000010' $$,
  'owner can make a teacher''s review private');
select lives_ok(
  $$ insert into public.invitations (child_id, email, role, invited_by) values
     ('a7000000-0000-0000-0000-000000000001', 'newteacher@example.com', 'teacher', '00000000-0000-0000-0000-0000000000a7') $$,
  'owner can invite a teacher');
select throws_ok(
  $$ insert into public.invitations (child_id, email, role, invited_by) values
     ('a7000000-0000-0000-0000-000000000001', 'boss@example.com', 'owner', '00000000-0000-0000-0000-0000000000a7') $$,
  '23514', null, 'invitations still cannot grant ownership');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000e7');
select is((select count(*)::int from public.posts where id = 'c7000000-0000-0000-0000-000000000010'), 0,
  'a review the owner made private is hidden from its teacher');
select pg_temp.logout();

select * from finish();
rollback;
