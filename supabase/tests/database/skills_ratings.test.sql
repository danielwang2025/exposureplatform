-- Skills belong to a child's members; ratings follow their review post.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a5', 'owner5@example.com',    '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b5', 'editor5@example.com',   '{"display_name":"Editor"}'),
  ('00000000-0000-0000-0000-0000000000c5', 'viewer5@example.com',   '{"display_name":"Viewer"}'),
  ('00000000-0000-0000-0000-0000000000d5', 'outsider5@example.com', '{"display_name":"Outsider"}');

insert into public.children (id, nickname, max_visibility, created_by) values
  ('a5000000-0000-0000-0000-000000000001', 'Ivy', 'public', '00000000-0000-0000-0000-0000000000a5'),
  ('a5000000-0000-0000-0000-000000000002', 'Other', 'family', '00000000-0000-0000-0000-0000000000d5');
insert into public.child_members (child_id, user_id, role) values
  ('a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a5', 'owner'),
  ('a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b5', 'editor'),
  ('a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c5', 'viewer'),
  ('a5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d5', 'owner');

insert into public.posts (id, child_id, author_id, kind, body, visibility) values
  ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b5', 'review', 'family review', 'family'),
  ('b5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b5', 'review', 'private review', 'private'),
  ('b5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b5', 'moment', 'a moment', 'family'),
  ('b5000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a5', 'review', 'owner review', 'family'),
  ('b5000000-0000-0000-0000-000000000009', 'a5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d5', 'review', 'other child', 'family');
insert into public.skills (id, child_id, name) values
  ('c5000000-0000-0000-0000-000000000009', 'a5000000-0000-0000-0000-000000000002', 'Other skill');

create function pg_temp.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- ---------------------------------------------------------------------------
-- Skills
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b5');
select lives_ok(
  $$ insert into public.skills (id, child_id, name, emoji, created_by) values
     ('c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'Music', '🎵', '00000000-0000-0000-0000-0000000000b5'),
     ('c5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'Reading', '📚', '00000000-0000-0000-0000-0000000000b5') $$,
  'editor can add skills');
select throws_ok(
  $$ insert into public.skills (child_id, name, created_by) values
     ('a5000000-0000-0000-0000-000000000001', ' music ', '00000000-0000-0000-0000-0000000000b5') $$,
  '23505', null, 'active skill names are unique per child (case-insensitive)');
select throws_ok(
  $$ insert into public.skills (child_id, name, created_by) values
     ('a5000000-0000-0000-0000-000000000001', '   ', '00000000-0000-0000-0000-0000000000b5') $$,
  '23514', null, 'blank skill names are rejected');
select lives_ok(
  $$ update public.skills set archived_at = now() where id = 'c5000000-0000-0000-0000-000000000002' $$,
  'editor can archive a skill');
delete from public.skills where id = 'c5000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.skills where id = 'c5000000-0000-0000-0000-000000000001'), 1,
  'editor cannot delete a skill');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000c5');
select is((select count(*)::int from public.skills where child_id = 'a5000000-0000-0000-0000-000000000001'), 2,
  'viewer can read the child''s skills');
select throws_ok(
  $$ insert into public.skills (child_id, name, created_by) values
     ('a5000000-0000-0000-0000-000000000001', 'Art', '00000000-0000-0000-0000-0000000000c5') $$,
  '42501', null, 'viewer cannot add skills');
update public.skills set name = 'Hacked' where id = 'c5000000-0000-0000-0000-000000000001';
select pg_temp.logout();
select is((select name from public.skills where id = 'c5000000-0000-0000-0000-000000000001'), 'Music',
  'viewer cannot rename skills');

select pg_temp.login('00000000-0000-0000-0000-0000000000d5');
select is((select count(*)::int from public.skills where child_id = 'a5000000-0000-0000-0000-000000000001'), 0,
  'outsider reads no skills');
select pg_temp.logout();
set local role anon;
select throws_ok('select * from public.skills', '42501', null, 'anon cannot read skills');
select pg_temp.logout();

-- At most 12 active skills.
insert into public.skills (child_id, name)
select 'a5000000-0000-0000-0000-000000000001', 'Skill ' || n from generate_series(1, 11) n;
select throws_ok(
  $$ insert into public.skills (child_id, name) values ('a5000000-0000-0000-0000-000000000001', 'One too many') $$,
  'P0001', null, 'a 13th active skill is rejected');
select throws_ok(
  $$ update public.skills set archived_at = null where id = 'c5000000-0000-0000-0000-000000000002' $$,
  'P0001', null, 'unarchiving past the limit is rejected');
delete from public.skills where name like 'Skill %';

-- ---------------------------------------------------------------------------
-- Ratings
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b5');
select lives_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000001', '{"c5000000-0000-0000-0000-000000000001": 4}') $$,
  'author can rate their review');
select lives_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000002', '{"c5000000-0000-0000-0000-000000000001": 2}') $$,
  'author can rate their private review');
select throws_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000003', '{"c5000000-0000-0000-0000-000000000001": 4}') $$,
  'P0001', null, 'moments cannot carry ratings');
select throws_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000001', '{"c5000000-0000-0000-0000-000000000002": 4}') $$,
  'P0001', null, 'archived skills cannot be newly rated');
select throws_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000001', '{"c5000000-0000-0000-0000-000000000001": 6}') $$,
  '23514', null, 'scores above 5 are rejected');
select throws_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000001', '{"c5000000-0000-0000-0000-000000000009": 3}') $$,
  '23503', null, 'cannot rate another child''s skill');
select throws_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000004', '{"c5000000-0000-0000-0000-000000000001": 3}') $$,
  '42501', null, 'editor cannot rate someone else''s review');
select pg_temp.logout();

-- A rating made before its skill was archived survives re-saving the post.
select pg_temp.logout();
insert into public.skills (id, child_id, name) values
  ('c5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 'Swimming');
select pg_temp.login('00000000-0000-0000-0000-0000000000b5');
select public.set_post_ratings('b5000000-0000-0000-0000-000000000002',
  '{"c5000000-0000-0000-0000-000000000001": 2, "c5000000-0000-0000-0000-000000000003": 3}');
update public.skills set archived_at = now() where id = 'c5000000-0000-0000-0000-000000000003';
select lives_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000002',
     '{"c5000000-0000-0000-0000-000000000001": 2, "c5000000-0000-0000-0000-000000000003": 4}') $$,
  'an existing rating on an archived skill can be kept and changed');
select pg_temp.logout();

-- Viewers read ratings only on posts they can read, and can't change them.
select pg_temp.login('00000000-0000-0000-0000-0000000000c5');
select results_eq(
  $$ select post_id from public.skill_ratings order by post_id $$,
  $$ values ('b5000000-0000-0000-0000-000000000001'::uuid) $$,
  'viewer sees ratings on family reviews only');
select throws_ok(
  $$ select public.set_post_ratings('b5000000-0000-0000-0000-000000000001', '{}') $$,
  '42501', null, 'viewer cannot change ratings');
update public.skill_ratings set score = 1;
select pg_temp.logout();
select is((select score::int from public.skill_ratings where post_id = 'b5000000-0000-0000-0000-000000000001'), 4,
  'viewer updates are ignored');

select pg_temp.login('00000000-0000-0000-0000-0000000000d5');
select is((select count(*)::int from public.skill_ratings where child_id = 'a5000000-0000-0000-0000-000000000001'), 0,
  'outsider reads no ratings');
select pg_temp.logout();
set local role anon;
select throws_ok('select * from public.skill_ratings', '42501', null, 'anon cannot read ratings');
select pg_temp.logout();

-- Replacing: keys left out are removed. Owners can rate anyone's review.
select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select public.set_post_ratings('b5000000-0000-0000-0000-000000000001', '{}');
select is((select count(*)::int from public.skill_ratings where post_id = 'b5000000-0000-0000-0000-000000000001'), 0,
  'an empty map clears the post''s ratings');
select public.set_post_ratings('b5000000-0000-0000-0000-000000000001', '{"c5000000-0000-0000-0000-000000000001": 5}');

-- A review turned into a moment loses its ratings.
update public.posts set kind = 'moment' where id = 'b5000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.skill_ratings where post_id = 'b5000000-0000-0000-0000-000000000001'), 0,
  'changing a review''s type removes its ratings');
select pg_temp.logout();

select * from finish();
rollback;
