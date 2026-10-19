-- Plus: only the webhook writes subscriptions; quota and free-tier locks
-- follow the plan; locked files can't be fetched; nothing is deleted.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a8', 'payer8@example.com', '{"display_name":"Payer"}'),
  ('00000000-0000-0000-0000-0000000000b8', 'other8@example.com', '{"display_name":"Other"}');
insert into public.children (id, nickname, created_by) values
  ('a8000000-0000-0000-0000-000000000001', 'Zed', '00000000-0000-0000-0000-0000000000a8');
insert into public.child_members (child_id, user_id, role) values
  ('a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a8', 'owner'),
  ('a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b8', 'viewer');
insert into public.posts (id, child_id, author_id, body, visibility) values
  ('b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a8', 'lots of photos', 'family');

-- Three 1 GiB photos, oldest first (bytes set directly, as settle_media would).
insert into public.media (id, post_id, child_id, uploader_id, kind, status, bytes, storage_path, thumb_path, created_at) values
  ('c8000000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a8', 'image', 'ready', 1073741824, 'z/1/full.jpg', 'z/1/thumb.jpg', now() - interval '3 days'),
  ('c8000000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a8', 'image', 'ready', 1073741824, 'z/2/full.jpg', 'z/2/thumb.jpg', now() - interval '2 days'),
  ('c8000000-0000-0000-0000-000000000003', 'b8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a8', 'image', 'ready', 1073741824, 'z/3/full.jpg', 'z/3/thumb.jpg', now() - interval '1 day');
insert into storage.objects (bucket_id, name) values ('media', 'z/1/thumb.jpg'), ('media', 'z/3/thumb.jpg');

create function pg_temp.login(p_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;
create function pg_temp.locked() returns text language sql as $$
  select string_agg(right(id::text, 1) || ':' || locked, ' ' order by created_at) from public.media
  where uploader_id = '00000000-0000-0000-0000-0000000000a8';
$$;

-- Users can't grant themselves Plus.
select pg_temp.login('00000000-0000-0000-0000-0000000000a8');
select throws_ok(
  $$ insert into public.subscriptions (user_id, stripe_customer_id, status) values ('00000000-0000-0000-0000-0000000000a8', 'cus_x', 'active') $$,
  '42501', null, 'users cannot write subscriptions');
select throws_ok(
  $$ select public.apply_plan('00000000-0000-0000-0000-0000000000a8') $$,
  '42501', null, 'users cannot call apply_plan');
select throws_ok(
  $$ select public.refresh_media_locks('00000000-0000-0000-0000-0000000000a8') $$,
  '42501', null, 'users cannot call refresh_media_locks');
select throws_ok(
  $$ update public.media set locked = false $$,
  '42501', null, 'users cannot unlock media themselves');
select throws_ok(
  $$ update public.profiles set storage_quota_bytes = 999999999999 where id = '00000000-0000-0000-0000-0000000000a8' $$,
  '42501', null, 'users cannot raise their own quota');
select pg_temp.logout();

-- Plus starts (as the webhook would).
set local role service_role;
insert into public.subscriptions (user_id, stripe_customer_id, stripe_subscription_id, status, billing_interval)
values ('00000000-0000-0000-0000-0000000000a8', 'cus_test', 'sub_test', 'active', 'year');
select public.apply_plan('00000000-0000-0000-0000-0000000000a8');
reset role;
select is((select storage_quota_bytes from public.profiles where id = '00000000-0000-0000-0000-0000000000a8'), 107374182400::bigint,
  'Plus raises the quota to 100 GiB');
select is(pg_temp.locked(), '1:false 2:false 3:false', 'nothing is locked with Plus');

select pg_temp.login('00000000-0000-0000-0000-0000000000a8');
select is((select count(*)::int from public.subscriptions), 1, 'users read their own subscription');
select pg_temp.logout();
select pg_temp.login('00000000-0000-0000-0000-0000000000b8');
select is((select count(*)::int from public.subscriptions), 0, 'users cannot read others'' subscriptions');
select pg_temp.logout();

-- Plus ends.
set local role service_role;
update public.subscriptions set status = 'canceled' where user_id = '00000000-0000-0000-0000-0000000000a8';
select public.apply_plan('00000000-0000-0000-0000-0000000000a8');
reset role;
select is((select storage_quota_bytes from public.profiles where id = '00000000-0000-0000-0000-0000000000a8'), 2147483648::bigint,
  'quota returns to 2 GiB');
select is(pg_temp.locked(), '1:false 2:false 3:true', 'the earliest 2 GiB stay visible; later media is locked');
select is((select count(*)::int from public.media where uploader_id = '00000000-0000-0000-0000-0000000000a8'), 3,
  'nothing is deleted');

-- Family members can't fetch a locked file either; unlocked files still work.
select pg_temp.login('00000000-0000-0000-0000-0000000000b8');
select is((select count(*)::int from storage.objects where name = 'z/3/thumb.jpg'), 0, 'locked file is not readable');
select is((select count(*)::int from storage.objects where name = 'z/1/thumb.jpg'), 1, 'unlocked file is readable');
select is((select count(*)::int from public.media where id = 'c8000000-0000-0000-0000-000000000003'), 1,
  'the locked media row is still listed (shown as locked)');
select pg_temp.logout();

-- Deleting older media brings later media back under 2 GiB.
delete from public.media where id = 'c8000000-0000-0000-0000-000000000001';
select is(pg_temp.locked(), '2:false 3:false', 'deleting frees space for the next oldest');

-- Past-due keeps Plus while Stripe retries.
set local role service_role;
update public.subscriptions set status = 'past_due' where user_id = '00000000-0000-0000-0000-0000000000a8';
select public.apply_plan('00000000-0000-0000-0000-0000000000a8');
reset role;
select is((select storage_quota_bytes from public.profiles where id = '00000000-0000-0000-0000-0000000000a8'), 107374182400::bigint,
  'past_due keeps Plus during retries');

select * from finish();
rollback;
