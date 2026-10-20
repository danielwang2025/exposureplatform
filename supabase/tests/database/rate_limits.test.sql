-- Rate-limit counter: server-only, fixed window.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'rl@example.com');

-- Users and visitors can't read, write or call it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select throws_ok('select * from public.rate_limits', '42501', null, 'users cannot read rate limits');
select throws_ok($$ select public.rate_limit_hit(repeat('a', 64), 5, 60) $$, '42501', null, 'users cannot record hits');
set local role anon;
select throws_ok($$ select public.rate_limit_hit(repeat('a', 64), 5, 60) $$, '42501', null, 'visitors cannot record hits');

-- The server counts hits per key within the window.
set local role service_role;
select ok(public.rate_limit_hit(repeat('b', 64), 2, 60), 'first hit allowed');
select ok(public.rate_limit_hit(repeat('b', 64), 2, 60), 'second hit allowed');
select ok(not public.rate_limit_hit(repeat('b', 64), 2, 60), 'third hit over the limit');
select ok(public.rate_limit_hit(repeat('c', 64), 2, 60), 'other keys are counted separately');

-- Once the window has passed, the count starts again.
reset role;
update public.rate_limits set window_start = now() - interval '2 minutes' where key = repeat('b', 64);
set local role service_role;
select ok(public.rate_limit_hit(repeat('b', 64), 2, 60), 'new window allows hits again');
reset role;
select is((select hits from public.rate_limits where key = repeat('b', 64)), 1, 'counter reset to 1');

select * from finish();
rollback;
