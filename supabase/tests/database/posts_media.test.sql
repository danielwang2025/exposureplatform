-- Access-control tests for posts, media, storage objects and quota.
begin;
create extension if not exists pgtap with schema extensions;

select plan(33);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com',    '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'editor@example.com',   '{"display_name":"Editor"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'viewer@example.com',   '{"display_name":"Viewer"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'stranger@example.com', '{"display_name":"Stranger"}');

insert into public.children (id, nickname, max_visibility, created_by)
values ('10000000-0000-0000-0000-000000000001', 'Leo', 'link', '00000000-0000-0000-0000-0000000000a1');
insert into public.child_members (child_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'editor'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'viewer');

create function pg_temp.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- Owner writes one family post and one private post.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into public.posts (id, child_id, author_id, body, visibility) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'First steps!', 'family'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Doctor visit', 'private');
select is((select count(*)::int from public.posts), 2, 'owner sees all posts');

select throws_ok(
  $$ insert into public.posts (child_id, author_id, body, visibility)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'x', 'public') $$,
  'P0001', 'Visibility exceeds the child''s maximum', 'visibility is capped by the child''s max');

-- Reading per role.
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.posts), 2, 'editor sees private posts');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.posts), 1, 'viewer sees only family-or-wider posts');
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.posts), 0, 'stranger sees no posts');

-- Writing per role.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$ insert into public.posts (child_id, author_id, body)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'hi') $$,
  '42501', null, 'viewer cannot post');

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
insert into public.posts (id, child_id, author_id, body) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'Editor post');
select throws_ok(
  $$ insert into public.posts (child_id, author_id, body)
     values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'spoof') $$,
  '42501', null, 'editor cannot post as someone else');
update public.posts set body = 'edited by editor' where id = '20000000-0000-0000-0000-000000000001';
update public.posts set body = 'Editor post (edited)' where id = '20000000-0000-0000-0000-000000000003';

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
update public.posts set visibility = 'private' where id = '20000000-0000-0000-0000-000000000003';
select pg_temp.logout();
select is((select body from public.posts where id = '20000000-0000-0000-0000-000000000001'),
  'First steps!', 'editor cannot edit someone else''s post');
select is((select body from public.posts where id = '20000000-0000-0000-0000-000000000003'),
  'Editor post (edited)', 'editor can edit their own post');
select is((select visibility::text from public.posts where id = '20000000-0000-0000-0000-000000000003'),
  'private', 'owner can edit any post');

-- Media creation reserves quota and checks permissions.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select throws_ok(
  $$ select public.create_media('20000000-0000-0000-0000-000000000001', 'image', 1000) $$,
  '42501', null, 'viewer cannot add media');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok(
  $$ select public.create_media('20000000-0000-0000-0000-000000000001', 'image', 1000) $$,
  '42501', null, 'editor cannot add media to someone else''s post');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
create temp table m1 as select * from public.create_media('20000000-0000-0000-0000-000000000001', 'image', 500000);
create temp table m2 as select * from public.create_media('20000000-0000-0000-0000-000000000002', 'image', 300000);
grant select on m1, m2 to authenticated, service_role;
select is((select storage_path from m1),
  '10000000-0000-0000-0000-000000000001/' || (select id from m1) || '/full.jpg', 'image gets a storage path');
select is((select status::text from m1), 'pending', 'new media is pending');
select is((select storage_used_bytes from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  800000::bigint, 'bytes are reserved against the uploader''s quota');
select throws_ok(
  $$ select public.create_media('20000000-0000-0000-0000-000000000001', 'image', 16 * 1024 * 1024) $$,
  'P0001', 'File too large', 'oversized image is rejected');
select pg_temp.logout();
update public.profiles set storage_quota_bytes = 900000 where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok(
  $$ select public.create_media('20000000-0000-0000-0000-000000000001', 'image', 200000) $$,
  'P0001', 'Storage quota exceeded', 'quota is enforced');

select throws_ok(
  $$ select public.settle_media((select id from m1), 1) $$,
  '42501', null, 'users cannot settle media themselves');

-- Media and storage objects follow the post's visibility.
select pg_temp.logout();
insert into storage.objects (bucket_id, name) values
  ('media', (select storage_path from m1)), ('media', (select thumb_path from m1)),
  ('media', (select storage_path from m2));

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.media), 1, 'viewer sees media of family posts only');
select is((select count(*)::int from storage.objects where bucket_id = 'media'), 2,
  'viewer can read files of family posts only');
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from storage.objects where bucket_id = 'media'), 0, 'stranger can read no files');
select is((select count(*)::int from public.media), 0, 'stranger sees no media');

-- Lowering the child's max visibility hides existing family posts from viewers.
select pg_temp.logout();
update public.children set max_visibility = 'private' where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
select is((select count(*)::int from public.posts), 0, 'max_visibility=private hides posts from viewers');
select is((select count(*)::int from storage.objects where bucket_id = 'media'), 0, '... and their files');
select pg_temp.logout();
update public.children set max_visibility = 'link' where id = '10000000-0000-0000-0000-000000000001';

-- Settling replaces the reservation with the real size.
set local role service_role;
select public.settle_media((select id from m1), 450000, 2048, 1536);
select pg_temp.logout();
select is((select status::text from public.media where id = (select id from m1)), 'ready', 'settled media is ready');
select is((select storage_used_bytes from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  750000::bigint, 'quota is adjusted to the real size');

-- Failing media refunds its reservation.
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.fail_media((select id from m2), 'x') $$, '42501', null, 'users cannot fail media');
select pg_temp.logout();
set local role service_role;
select public.fail_media((select id from m2), 'too_long');
select pg_temp.logout();
select is((select status::text || ':' || bytes from public.media where id = (select id from m2)), 'failed:0', 'failed media holds no bytes');
select is((select storage_used_bytes from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  450000::bigint, 'failing media refunds quota');

-- Viewers can't delete media; deleting the post cascades and refunds quota.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
delete from public.media;
select pg_temp.logout();
select is((select count(*)::int from public.media where child_id = '10000000-0000-0000-0000-000000000001'), 2, 'viewer cannot delete media');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
delete from public.posts where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.logout();
select is((select count(*)::int from public.media where child_id = '10000000-0000-0000-0000-000000000001'), 1, 'deleting a post deletes its media');
select is((select storage_used_bytes from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  0::bigint, 'deleting media refunds quota');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
delete from public.children;
select pg_temp.logout();
select is((select storage_used_bytes from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  0::bigint, 'deleting the child refunds all its media');

select * from finish();
rollback;
