-- Access-control tests for child profiles, membership and invitations.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- Test users: Alice (parent/owner), Bob (invited co-guardian), Carol (stranger).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name":"Alice","guardian_attested":true}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"display_name":"Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com', '{"display_name":"Carol"}');

create function pg_temp.login(p_id uuid, p_email text) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'email', p_email, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.logout() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true);
$$;

-- Profiles are created from sign-up metadata.
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Alice', 'profile is created on sign-up');
select isnt(
  (select guardian_attested_at from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  null, 'guardian attestation is recorded');

-- Alice creates a child and becomes its owner.
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
create temp table ids as select public.create_child('Mia', '2020-05-01', 'family') as child_id;
grant select on ids to authenticated;

select is(
  (select role::text from public.child_members where child_id = (select child_id from ids)),
  'owner', 'creator becomes owner');
select is((select count(*)::int from public.children), 1, 'owner can read the child');

insert into public.invitations (child_id, email, role, invited_by)
values ((select child_id from ids), 'Bob@Example.com', 'editor', '00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.invitations), 1, 'owner can create and read invitations');

select throws_ok(
  $$ insert into public.invitations (child_id, email, role, invited_by)
     values ((select child_id from ids), 'x@example.com', 'owner', '00000000-0000-0000-0000-00000000000a') $$,
  '23514', null, 'cannot invite someone directly as owner');

select pg_temp.logout();
create temp table tok as select token from public.invitations where child_id = (select child_id from ids);
grant select on tok to authenticated, anon;

-- Carol is a stranger: sees and changes nothing.
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'carol@example.com');
select is((select count(*)::int from public.children), 0, 'stranger cannot read the child');
select is((select count(*)::int from public.child_members), 0, 'stranger cannot read members');
select is((select count(*)::int from public.invitations), 0, 'stranger cannot read invitations');
select is((select count(*)::int from public.profiles where id <> '00000000-0000-0000-0000-00000000000c'),
  0, 'stranger cannot read other profiles');

update public.children set nickname = 'Hacked';
select pg_temp.logout();
select is((select nickname from public.children where id = (select child_id from ids)), 'Mia', 'stranger cannot update the child');

select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'carol@example.com');
select throws_ok(
  $$ insert into public.invitations (child_id, email, role, invited_by)
     values ((select child_id from ids), 'carol2@example.com', 'viewer', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'stranger cannot create invitations');

-- A forwarded invitation link doesn't work for the wrong account.
select throws_ok(
  'select public.accept_invitation((select token from tok))',
  'P0001', 'Invitation was sent to a different email', 'invitation is bound to its email');
select pg_temp.logout();

-- Anonymous visitors can preview an invitation by token, but read no tables.
set local role anon;
select is((select status from public.get_invitation((select token from tok))), 'pending', 'anon can preview invitation');
select throws_ok('select * from public.children', '42501', null, 'anon cannot query children');
select pg_temp.logout();

-- Bob accepts (email comparison is case-insensitive) and becomes an editor.
select pg_temp.login('00000000-0000-0000-0000-00000000000b', 'bob@example.com');
select is(public.accept_invitation((select token from tok)), (select child_id from ids), 'invitee can accept');
select is((select count(*)::int from public.children), 1, 'editor can read the child');
select is((select count(*)::int from public.profiles), 2, 'co-guardians can see each other''s profiles');
select is((select count(*)::int from public.invitations), 0, 'editor cannot read invitations');
select throws_ok(
  format('select public.accept_invitation(%L)', (select token from tok)),
  'P0001', 'Invitation already used', 'invitation cannot be reused');

update public.children set nickname = 'Mia-Rose';
delete from public.children;
update public.child_members set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.logout();
select is((select nickname from public.children where id = (select child_id from ids)), 'Mia-Rose', 'editor can update the child');
select is((select count(*)::int from public.children where id = (select child_id from ids)), 1, 'editor cannot delete the child');
select is(
  (select role::text from public.child_members where user_id = '00000000-0000-0000-0000-00000000000b'),
  'editor', 'editor cannot promote themselves');

-- Owners can't orphan a child profile.
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
select throws_ok(
  $$ delete from public.child_members where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  'P0001', 'A child profile must keep at least one owner', 'last owner cannot leave');
select throws_ok(
  $$ update public.child_members set role = 'viewer' where user_id = '00000000-0000-0000-0000-00000000000a' $$,
  'P0001', 'A child profile must keep at least one owner', 'last owner cannot demote themselves');

-- Expired invitations are rejected.
insert into public.invitations (child_id, email, role, invited_by, expires_at)
values ((select child_id from ids), 'carol@example.com', 'viewer', '00000000-0000-0000-0000-00000000000a', now() - interval '1 day');
select pg_temp.logout();
create temp table expired_tok as select token from public.invitations where child_id = (select child_id from ids) and email = 'carol@example.com';
grant select on expired_tok to authenticated;
select pg_temp.login('00000000-0000-0000-0000-00000000000c', 'carol@example.com');
select throws_ok(
  $$ select public.accept_invitation((select token from expired_tok)) $$,
  'P0001', 'Invitation expired', 'expired invitation is rejected');

-- Deleting the child (owner) cascades despite the last-owner guard.
select pg_temp.login('00000000-0000-0000-0000-00000000000a', 'alice@example.com');
delete from public.children;
select pg_temp.logout();
select is((select count(*)::int from public.child_members where child_id = (select child_id from ids)), 0, 'owner can delete the child and memberships cascade');

select * from finish();
rollback;
