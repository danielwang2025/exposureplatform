-- Comments and likes are for signed-in members who can read the post.
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a3', 'owner3@example.com',  '{"display_name":"Owner"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'editor3@example.com', '{"display_name":"Editor"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'viewer3@example.com', '{"display_name":"Viewer"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'outsider3@example.com', '{"display_name":"Outsider"}');

insert into public.children (id, nickname, max_visibility, created_by)
values ('70000000-0000-0000-0000-000000000001', 'Zoe', 'public', '00000000-0000-0000-0000-0000000000a3');
insert into public.child_members (child_id, user_id, role) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'owner'),
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b3', 'editor'),
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', 'viewer');
insert into public.posts (id, child_id, author_id, body, visibility) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'family post', 'family'),
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'private post', 'private'),
  ('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', 'public post', 'public');

create function pg_temp.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- Viewer comments and likes on a family post.
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
select lives_ok(
  $$ insert into public.comments (id, post_id, child_id, author_id, body) values
     ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', 'So proud!') $$,
  'viewer can comment on a family post');
select lives_ok(
  $$ insert into public.post_likes (post_id, child_id, user_id) values
     ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3') $$,
  'viewer can like a family post');
select throws_ok(
  $$ insert into public.comments (post_id, child_id, author_id, body) values
     ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', 'peek') $$,
  '42501', null, 'viewer cannot comment on a post they cannot read');
select throws_ok(
  $$ insert into public.post_likes (post_id, child_id, user_id) values
     ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3') $$,
  '42501', null, 'viewer cannot like a post they cannot read');
select throws_ok(
  $$ insert into public.comments (post_id, child_id, author_id, body) values
     ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b3', 'spoof') $$,
  '42501', null, 'cannot comment as someone else');
select throws_ok(
  $$ insert into public.comments (post_id, child_id, author_id, body) values
     ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', '   ') $$,
  '23514', null, 'empty comments are rejected');

-- Outsiders and anonymous visitors: nothing, even on a public post.
select pg_temp.login('00000000-0000-0000-0000-0000000000d3');
select throws_ok(
  $$ insert into public.comments (post_id, child_id, author_id, body) values
     ('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d3', 'hi') $$,
  '42501', null, 'outsider cannot comment even on a public post');
select is((select count(*)::int from public.comments where child_id = '70000000-0000-0000-0000-000000000001'), 0, 'outsider reads no comments');
select is((select count(*)::int from public.post_likes where child_id = '70000000-0000-0000-0000-000000000001'), 0, 'outsider reads no likes');
select pg_temp.logout();
set local role anon;
select throws_ok('select * from public.comments', '42501', null, 'anon cannot read comments');
select throws_ok('select * from public.post_likes', '42501', null, 'anon cannot read likes');
select pg_temp.logout();

-- Editing and deleting.
select pg_temp.login('00000000-0000-0000-0000-0000000000b3');
update public.comments set body = 'hijacked' where id = '90000000-0000-0000-0000-000000000001';
delete from public.comments where id = '90000000-0000-0000-0000-000000000001';
delete from public.post_likes where user_id = '00000000-0000-0000-0000-0000000000c3';
select pg_temp.logout();
select is((select body from public.comments where id = '90000000-0000-0000-0000-000000000001'), 'So proud!',
  'others cannot edit a comment');
select is((select count(*)::int from public.comments where id = '90000000-0000-0000-0000-000000000001'), 1,
  'editors cannot delete others'' comments');
select is((select count(*)::int from public.post_likes where user_id = '00000000-0000-0000-0000-0000000000c3'), 1,
  'others cannot remove your like');

select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
update public.comments set body = 'So, so proud!' where id = '90000000-0000-0000-0000-000000000001';
select pg_temp.logout();
select is((select body from public.comments where id = '90000000-0000-0000-0000-000000000001'), 'So, so proud!',
  'author can edit their comment');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
delete from public.comments where id = '90000000-0000-0000-0000-000000000001';
select pg_temp.logout();
select is((select count(*)::int from public.comments where id = '90000000-0000-0000-0000-000000000001'), 0,
  'owner can delete any comment on their child''s profile');

-- Deleting an account removes that person's comments and likes.
insert into public.comments (post_id, child_id, author_id, body) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', 'again');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c3';
select is((select count(*)::int from public.comments where child_id = '70000000-0000-0000-0000-000000000001'), 0,
  'account deletion removes comments');
select is((select count(*)::int from public.post_likes where child_id = '70000000-0000-0000-0000-000000000001'), 0,
  'account deletion removes likes');

select * from finish();
rollback;
