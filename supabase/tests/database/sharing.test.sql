-- Projects, share links, public pages and the anonymous access functions.
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a2', 'owner2@example.com',  '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'editor2@example.com', '{"display_name":"Editor"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'viewer2@example.com', '{"display_name":"Viewer"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'other2@example.com',  '{"display_name":"Other"}');

-- Ava: max visibility public. Ben: another family's child, max family.
insert into public.children (id, nickname, birth_date, max_visibility, created_by) values
  ('30000000-0000-0000-0000-000000000001', 'Ava', current_date - interval '6 years 2 months', 'public', '00000000-0000-0000-0000-0000000000a2'),
  ('30000000-0000-0000-0000-000000000002', 'Ben', null, 'family', '00000000-0000-0000-0000-0000000000e2');
insert into public.child_members (child_id, user_id, role) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'owner'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'editor'),
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', 'viewer'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e2', 'owner');

create function pg_temp.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
insert into public.projects (id, child_id, title, emoji, visibility, created_by) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Piano', '🎹', 'link', '00000000-0000-0000-0000-0000000000b2'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Speech therapy', null, 'private', '00000000-0000-0000-0000-0000000000b2');
select is((select count(*)::int from public.projects where child_id = '30000000-0000-0000-0000-000000000001'), 2, 'editor can create projects');

select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from public.projects), 1, 'viewer sees only family-or-wider projects');
select throws_ok(
  $$ insert into public.projects (child_id, title, created_by)
     values ('30000000-0000-0000-0000-000000000001', 'x', '00000000-0000-0000-0000-0000000000c2') $$,
  '42501', null, 'viewer cannot create projects');

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select is((select count(*)::int from public.projects where child_id = '30000000-0000-0000-0000-000000000001'), 0,
  'outsider sees no projects');

-- Posts: one per visibility level, plus one in each project.
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
insert into public.posts (id, child_id, author_id, body, visibility, occurred_on, project_id) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'private', 'private', '2024-01-01', null),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'family',  'family',  '2024-02-01', null),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'link',    'link',    '2024-03-01', null),
  ('50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'public',  'public',  '2024-04-01', null),
  ('50000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'piano 1', 'link',    '2024-05-01', '40000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'piano 2', 'public',  '2024-06-01', '40000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'speech',  'public',  '2024-07-01', '40000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.posts where child_id = '30000000-0000-0000-0000-000000000001'), 7, 'owner wrote 7 posts');

select pg_temp.logout();
insert into public.projects (id, child_id, title) values
  ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000002', 'Ben project');
select throws_ok(
  $$ update public.posts set project_id = '40000000-0000-0000-0000-000000000009'
     where id = '50000000-0000-0000-0000-000000000002' $$,
  '23503', null, 'a post cannot join another child''s project');

-- Deleting a project unlinks (not deletes) its posts.
insert into public.projects (id, child_id, title) values
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Temp');
update public.posts set project_id = '40000000-0000-0000-0000-000000000003' where id = '50000000-0000-0000-0000-000000000002';
delete from public.projects where id = '40000000-0000-0000-0000-000000000003';
select is((select project_id from public.posts where id = '50000000-0000-0000-0000-000000000002'), null,
  'deleting a project keeps its posts');
select is((select child_id from public.posts where id = '50000000-0000-0000-0000-000000000002'),
  '30000000-0000-0000-0000-000000000001'::uuid, '... and their child');

-- ---------------------------------------------------------------------------
-- Public page address
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$ select public.set_child_slug('30000000-0000-0000-0000-000000000001', 'ava') $$,
  '42501', null, 'editors cannot set the address');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select public.set_child_slug('30000000-0000-0000-0000-000000000001', 'a') $$,
  'P0001', 'Invalid address', 'too short');
select throws_ok($$ select public.set_child_slug('30000000-0000-0000-0000-000000000001', 'bad slug!') $$,
  'P0001', 'Invalid address', 'invalid characters');
select throws_ok($$ select public.set_child_slug('30000000-0000-0000-0000-000000000001', 'admin') $$,
  'P0001', 'Invalid address', 'reserved word');
select is(public.set_child_slug('30000000-0000-0000-0000-000000000001', '  Ava-Lin '), 'ava-lin', 'address is normalised');

select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select throws_ok($$ select public.set_child_slug('30000000-0000-0000-0000-000000000002', 'AVA-LIN') $$,
  'P0001', 'Address already taken', 'addresses are unique, case-insensitive');

-- ---------------------------------------------------------------------------
-- Public page (anonymous)
-- ---------------------------------------------------------------------------
set local role anon;
select is((select child_nickname from public.public_child('ava-lin')), 'Ava', 'public page resolves');
select is((select child_age_years from public.public_child('ava-lin')), 6, 'public page shows age in years only');
select results_eq(
  $$ select post_id from public.public_post_ids('ava-lin') $$,
  $$ values ('50000000-0000-0000-0000-000000000007'::uuid), ('50000000-0000-0000-0000-000000000006'::uuid), ('50000000-0000-0000-0000-000000000004'::uuid) $$,
  'public page lists only public posts, newest first');
select is(
  (select project_title from public.public_post_ids('ava-lin') where post_id = '50000000-0000-0000-0000-000000000006'),
  null, 'a link-only project is not named on the public page');
select is(
  (select project_title from public.public_post_ids('ava-lin') where post_id = '50000000-0000-0000-0000-000000000007'),
  null, 'a private project is not named on the public page');
select throws_ok('select * from public.posts', '42501', null, 'anon still cannot read tables');
select throws_ok('select * from public.share_links', '42501', null, 'anon cannot read share links');
select pg_temp.logout();

-- Lowering max visibility takes the page down immediately.
update public.children set max_visibility = 'link' where id = '30000000-0000-0000-0000-000000000001';
set local role anon;
select is((select count(*)::int from public.public_child('ava-lin')), 0, 'no public page when max visibility < public');
select is((select count(*)::int from public.public_post_ids('ava-lin')), 0, '... and no posts');
select pg_temp.logout();
update public.children set max_visibility = 'public' where id = '30000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Share links
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
select throws_ok(
  $$ insert into public.share_links (child_id, scope, created_by)
     values ('30000000-0000-0000-0000-000000000001', 'child', '00000000-0000-0000-0000-0000000000b2') $$,
  '42501', null, 'editors cannot create share links');

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
insert into public.share_links (id, child_id, scope, project_id, post_id, expires_at, created_by) values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'child', null, null, null, '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'project', '40000000-0000-0000-0000-000000000001', null, null, '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'post', null, '50000000-0000-0000-0000-000000000003', null, '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'post', null, '50000000-0000-0000-0000-000000000002', null, '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'child', null, null, now() - interval '1 minute', '00000000-0000-0000-0000-0000000000a2'),
  ('60000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 'project', '40000000-0000-0000-0000-000000000002', null, null, '00000000-0000-0000-0000-0000000000a2');
select pg_temp.logout();
create temp table tokens as select id, token from public.share_links where child_id = '30000000-0000-0000-0000-000000000001';
grant select on tokens to anon, authenticated;
create function pg_temp.tok(p_id text) returns text language sql as $$ select token from tokens where id = p_id::uuid $$;

select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from public.share_links), 0, 'viewers cannot see share links');

set local role anon;
-- Whole-profile link: link + public posts (not private/family).
select results_eq(
  format('select post_id from public.shared_post_ids(%L)', pg_temp.tok('60000000-0000-0000-0000-000000000001')),
  $$ values ('50000000-0000-0000-0000-000000000007'::uuid), ('50000000-0000-0000-0000-000000000006'::uuid),
            ('50000000-0000-0000-0000-000000000005'::uuid), ('50000000-0000-0000-0000-000000000004'::uuid),
            ('50000000-0000-0000-0000-000000000003'::uuid) $$,
  'profile link reveals link and public posts only');
select is(
  (select project_title from public.shared_post_ids(pg_temp.tok('60000000-0000-0000-0000-000000000001'))
   where post_id = '50000000-0000-0000-0000-000000000005'),
  'Piano', 'link-shared project is named on a share link');
select is(
  (select project_title from public.shared_post_ids(pg_temp.tok('60000000-0000-0000-0000-000000000001'))
   where post_id = '50000000-0000-0000-0000-000000000007'),
  null, 'private project is not named on a share link');

-- Project link: only that project's posts, oldest first.
select is((select project_title from public.resolve_share(pg_temp.tok('60000000-0000-0000-0000-000000000002'))), 'Piano', 'project link resolves');
select results_eq(
  format('select post_id from public.shared_post_ids(%L)', pg_temp.tok('60000000-0000-0000-0000-000000000002')),
  $$ values ('50000000-0000-0000-0000-000000000005'::uuid), ('50000000-0000-0000-0000-000000000006'::uuid) $$,
  'project link reveals the project''s posts, oldest first');
select is((select count(*)::int from public.resolve_share(pg_temp.tok('60000000-0000-0000-0000-000000000006'))), 0,
  'a link to a private project shows nothing');
select is((select count(*)::int from public.shared_post_ids(pg_temp.tok('60000000-0000-0000-0000-000000000006'))), 0,
  '... and reveals no posts');

-- Post links.
select results_eq(
  format('select post_id from public.shared_post_ids(%L)', pg_temp.tok('60000000-0000-0000-0000-000000000003')),
  $$ values ('50000000-0000-0000-0000-000000000003'::uuid) $$,
  'post link reveals exactly that post');
select is((select count(*)::int from public.resolve_share(pg_temp.tok('60000000-0000-0000-0000-000000000004'))), 0,
  'a link to a family-only post shows nothing');

-- Expired, revoked and unknown tokens.
select is((select count(*)::int from public.resolve_share(pg_temp.tok('60000000-0000-0000-0000-000000000005'))), 0, 'expired link shows nothing');
select is((select count(*)::int from public.shared_post_ids('nope')), 0, 'unknown token reveals nothing');
select pg_temp.logout();

select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
update public.share_links set revoked_at = now() where id = '60000000-0000-0000-0000-000000000003';
set local role anon;
select is((select count(*)::int from public.shared_post_ids(pg_temp.tok('60000000-0000-0000-0000-000000000003'))), 0, 'revoked link reveals nothing');

-- Views are counted.
select pg_temp.logout();
select is((select view_count from public.share_links where id = '60000000-0000-0000-0000-000000000002'), 1, 'resolving a link counts a view');

-- Narrowing the child's max visibility kills every share link.
update public.children set max_visibility = 'family' where id = '30000000-0000-0000-0000-000000000001';
set local role anon;
select is((select count(*)::int from public.resolve_share(pg_temp.tok('60000000-0000-0000-0000-000000000001'))), 0,
  'max visibility family disables share links');
select is((select count(*)::int from public.shared_post_ids(pg_temp.tok('60000000-0000-0000-0000-000000000001'))), 0,
  '... and their posts');
select pg_temp.logout();

select * from finish();
rollback;
