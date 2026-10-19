-- Growth reports are members-only and follow the same edit rules as posts.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a6', 'owner6@example.com',    '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b6', 'editor6@example.com',   '{"display_name":"Editor"}'),
  ('00000000-0000-0000-0000-0000000000c6', 'viewer6@example.com',   '{"display_name":"Viewer"}'),
  ('00000000-0000-0000-0000-0000000000d6', 'outsider6@example.com', '{"display_name":"Outsider"}');

insert into public.children (id, nickname, max_visibility, created_by) values
  ('a6000000-0000-0000-0000-000000000001', 'Ana', 'public', '00000000-0000-0000-0000-0000000000a6');
insert into public.child_members (child_id, user_id, role) values
  ('a6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a6', 'owner'),
  ('a6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b6', 'editor'),
  ('a6000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c6', 'viewer');

create function pg_temp.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- Creating
select pg_temp.login('00000000-0000-0000-0000-0000000000b6');
select lives_ok(
  $$ insert into public.reports (id, child_id, title, period_start, period_end, visibility, created_by) values
     ('d6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'Autumn', '2026-09-01', '2026-11-30', 'family', '00000000-0000-0000-0000-0000000000b6'),
     ('d6000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000001', 'Notes', '2026-01-01', '2026-06-30', 'private', '00000000-0000-0000-0000-0000000000b6') $$,
  'editor can create reports');
select throws_ok(
  $$ insert into public.reports (child_id, title, period_start, period_end, visibility, created_by) values
     ('a6000000-0000-0000-0000-000000000001', 'Shared', '2026-01-01', '2026-02-01', 'link', '00000000-0000-0000-0000-0000000000b6') $$,
  '23514', null, 'reports cannot be shared by link');
select throws_ok(
  $$ insert into public.reports (child_id, title, period_start, period_end, created_by) values
     ('a6000000-0000-0000-0000-000000000001', 'Backwards', '2026-03-01', '2026-02-01', '00000000-0000-0000-0000-0000000000b6') $$,
  '23514', null, 'the period cannot end before it starts');
select throws_ok(
  $$ insert into public.reports (child_id, title, period_start, period_end, highlight_media_ids, created_by) values
     ('a6000000-0000-0000-0000-000000000001', 'Too many', '2026-01-01', '2026-02-01',
      array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()],
      '00000000-0000-0000-0000-0000000000b6') $$,
  '23514', null, 'at most six highlights');
select throws_ok(
  $$ insert into public.reports (child_id, title, period_start, period_end, created_by) values
     ('a6000000-0000-0000-0000-000000000001', 'Spoof', '2026-01-01', '2026-02-01', '00000000-0000-0000-0000-0000000000a6') $$,
  '42501', null, 'cannot create a report as someone else');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000a6');
select lives_ok(
  $$ insert into public.reports (id, child_id, title, period_start, period_end, created_by) values
     ('d6000000-0000-0000-0000-000000000003', 'a6000000-0000-0000-0000-000000000001', 'Owner''s', '2026-01-01', '2026-12-31', '00000000-0000-0000-0000-0000000000a6') $$,
  'owner can create reports');
select pg_temp.logout();

-- Reading
select pg_temp.login('00000000-0000-0000-0000-0000000000c6');
select results_eq(
  $$ select title from public.reports order by title $$,
  $$ values ('Autumn'), ('Owner''s') $$,
  'viewer reads family reports, not private ones');
select throws_ok(
  $$ insert into public.reports (child_id, title, period_start, period_end, created_by) values
     ('a6000000-0000-0000-0000-000000000001', 'Mine', '2026-01-01', '2026-02-01', '00000000-0000-0000-0000-0000000000c6') $$,
  '42501', null, 'viewer cannot create reports');
update public.reports set title = 'Hacked';
delete from public.reports;
select pg_temp.logout();
select is((select count(*)::int from public.reports where title = 'Hacked'), 0, 'viewer cannot edit reports');
select is((select count(*)::int from public.reports where child_id = 'a6000000-0000-0000-0000-000000000001'), 3, 'viewer cannot delete reports');

select pg_temp.login('00000000-0000-0000-0000-0000000000d6');
select is((select count(*)::int from public.reports), 0, 'outsider reads no reports');
select pg_temp.logout();
set local role anon;
select throws_ok('select * from public.reports', '42501', null, 'anon cannot read reports');
select pg_temp.logout();

-- Editing
select pg_temp.login('00000000-0000-0000-0000-0000000000b6');
update public.reports set title = 'Edited by editor' where id = 'd6000000-0000-0000-0000-000000000003';
select lives_ok(
  $$ update public.reports set summary = 'A lovely term.' where id = 'd6000000-0000-0000-0000-000000000001' $$,
  'author can edit their report');
select pg_temp.logout();
select is((select title from public.reports where id = 'd6000000-0000-0000-0000-000000000003'), 'Owner''s',
  'editor cannot edit the owner''s report');

select pg_temp.login('00000000-0000-0000-0000-0000000000a6');
select lives_ok(
  $$ update public.reports set title = 'Autumn term' where id = 'd6000000-0000-0000-0000-000000000001' $$,
  'owner can edit anyone''s report');

-- The child's cap applies: lowering it hides family reports from viewers.
update public.children set max_visibility = 'private' where id = 'a6000000-0000-0000-0000-000000000001';
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000c6');
select is((select count(*)::int from public.reports), 0, 'a private-only profile hides reports from viewers');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000a6');
select throws_ok(
  $$ update public.reports set visibility = 'family' where id = 'd6000000-0000-0000-0000-000000000002' $$,
  'P0001', null, 'report visibility cannot exceed the child''s maximum');
select pg_temp.logout();

select * from finish();
rollback;
