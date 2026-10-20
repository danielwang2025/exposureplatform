-- Fixed-window rate limits for abuse-prone actions (sign-in, sign-up,
-- password reset, invitations, comments, account deletion).
--
-- These requests reach Supabase Auth from our server, not the visitor's
-- browser, so Auth's own per-IP limits see the server's address. The app
-- therefore counts attempts itself, keyed by a hash of e.g. "sign-in:email"
-- or "sign-in-ip:1.2.3.4" (no raw emails or IPs are stored).

create table public.rate_limits (
  key text primary key check (char_length(key) = 64),
  window_start timestamptz not null default now(),
  hits integer not null default 1
);

alter table public.rate_limits enable row level security;
-- No policies and no grants: only the service role (server) touches this.
revoke all on public.rate_limits from anon, authenticated;

-- Records one hit and returns true while the key is within its limit.
create function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
      else r.hits + 1
    end,
    window_start = case
      when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
      else r.window_start
    end
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
