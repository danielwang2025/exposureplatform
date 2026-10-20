-- Skill dimensions and post scores.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a4', 'owner4@example.com',  '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b4', 'editor4@example.com', '{"display_name":"Editor"}'),
  ('00000000-0000-0000-0000-0000000000c4', 'viewer4@example.com', '{"display_name":"Viewer"}');

insert into public.children (id, nickname, max_visibility, created_by)
values ('a0000000-0000-0000-0000-000000000001', 'Ivy', 'family', '00000000-0000-0000-0000-0000000000a4');
insert into public.child_members (child_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b4', 'editor'),
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c4', 'viewer');
insert into public.projects (id, child_id, title, visibility) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Piano', 'family'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Swim', 'family');
insert into public.posts (id, child_id, author_id, kind, body, visibility, project_id) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', 'review', 'owner review', 'family', 'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b4', 'review', 'editor review', 'private', 'b0000000-0000-0000-0000-000000000001');

create function pg_temp.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- Dimensions
select pg_temp.login('00000000-0000-0000-0000-0000000000b4');
insert into public.skill_dimensions (id, project_id, child_id, name, position) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Rhythm', 0),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Expression', 1),
  ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Breathing', 0);
select is((select count(*)::int from public.skill_dimensions), 3, 'editor can define skills');
select throws_ok(
  $$ insert into public.skill_dimensions (project_id, child_id, name)
     values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', ' rhythm ') $$,
  '23505', null, 'skill names are unique per project, ignoring case and spaces');

select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
select throws_ok(
  $$ insert into public.skill_dimensions (project_id, child_id, name)
     values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Peek') $$,
  '42501', null, 'viewer cannot define skills');
select is((select count(*)::int from public.skill_dimensions), 3, 'viewer can read skills of visible projects');

select pg_temp.logout();
insert into public.skill_dimensions (project_id, child_id, name)
select 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'extra ' || n
from generate_series(1, 6) as n;
select throws_ok(
  $$ insert into public.skill_dimensions (project_id, child_id, name)
     values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ninth') $$,
  'P0001', 'A project can have at most 8 skills', 'at most 8 skills per project');
delete from public.skill_dimensions where name like 'extra %';

-- Scores
select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select lives_ok(
  $$ select public.set_post_scores('c0000000-0000-0000-0000-000000000001',
       '{"d0000000-0000-0000-0000-000000000001": 2, "d0000000-0000-0000-0000-000000000002": 3}') $$,
  'owner can score their review');
select is((select count(*)::int from public.post_scores where post_id = 'c0000000-0000-0000-0000-000000000001'), 2, 'two scores saved');
select lives_ok(
  $$ select public.set_post_scores('c0000000-0000-0000-0000-000000000001', '{"d0000000-0000-0000-0000-000000000001": 4}') $$,
  'scores can be replaced');
select is(
  (select string_agg(score::text, ',') from public.post_scores where post_id = 'c0000000-0000-0000-0000-000000000001'),
  '4', 'replacing removes scores that were left out');
select throws_ok(
  $$ select public.set_post_scores('c0000000-0000-0000-0000-000000000001', '{"d0000000-0000-0000-0000-000000000001": 6}') $$,
  '23514', null, 'scores must be 1–5');
select throws_ok(
  $$ select public.set_post_scores('c0000000-0000-0000-0000-000000000001', '{"d0000000-0000-0000-0000-000000000003": 3}') $$,
  'P0001', 'Skill does not belong to this post''s project', 'cannot use another project''s skill');

select pg_temp.login('00000000-0000-0000-0000-0000000000b4');
select throws_ok(
  $$ select public.set_post_scores('c0000000-0000-0000-0000-000000000001', '{"d0000000-0000-0000-0000-000000000001": 1}') $$,
  '42501', null, 'editor cannot score someone else''s post');
select lives_ok(
  $$ select public.set_post_scores('c0000000-0000-0000-0000-000000000002', '{"d0000000-0000-0000-0000-000000000002": 5}') $$,
  'editor can score their own post');

select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
select throws_ok(
  $$ select public.set_post_scores('c0000000-0000-0000-0000-000000000001', '{"d0000000-0000-0000-0000-000000000001": 1}') $$,
  '42501', null, 'viewer cannot score');
select is((select count(*)::int from public.post_scores), 1, 'viewer only sees scores of posts they can read');

-- Moving the post to another project drops its old scores.
select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
update public.posts set project_id = 'b0000000-0000-0000-0000-000000000002' where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.logout();
select is((select count(*)::int from public.post_scores where post_id = 'c0000000-0000-0000-0000-000000000001'), 0,
  'changing project drops scores');

-- Deleting a skill deletes its scores.
delete from public.skill_dimensions where id = 'd0000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.post_scores where post_id = 'c0000000-0000-0000-0000-000000000002'), 0,
  'deleting a skill deletes its scores');

select * from finish();
rollback;
