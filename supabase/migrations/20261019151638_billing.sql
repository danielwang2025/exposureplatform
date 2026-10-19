-- Sprout Plus (Stripe subscriptions).
--
-- * Stripe is the source of truth. Only the webhook (service role) writes
--   public.subscriptions; users can read their own row.
-- * Plus raises the uploader's quota (2 GiB → 100 GiB) and allows video.
-- * When Plus ends nothing is deleted. Each uploader's earliest 2 GiB of
--   media stays visible; anything after that is "locked": its files can't
--   be fetched (storage policy below, and the server skips signing it) until
--   Plus is active again. The data export still includes everything.

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  -- Stripe's subscription status (active, trialing, past_due, canceled, ...).
  status text,
  -- month | quarter | half_year | year
  billing_interval text check (billing_interval in ('month', 'quarter', 'half_year', 'year')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Stripe doesn't guarantee event order; older events than this are ignored.
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Past-due keeps Plus while Stripe retries the card.
create function public.has_plus(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = p_user_id and status in ('active', 'trialing', 'past_due')
  );
$$;

-- ---------------------------------------------------------------------------
-- Free-tier locks
-- ---------------------------------------------------------------------------
alter table public.media add column locked boolean not null default false;

-- Recomputes which of an uploader's media are past the free 2 GiB, oldest
-- first. Run when Plus starts or ends and when media is deleted.
create function public.refresh_media_locks(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;
  if public.has_plus(p_user_id) then
    update public.media set locked = false where uploader_id = p_user_id and locked;
    return;
  end if;

  update public.media m
  set locked = r.over
  from (
    select id,
      sum(bytes) over (order by created_at, id rows between unbounded preceding and current row) > 2147483648 as over
    from public.media
    where uploader_id = p_user_id and status <> 'failed'
  ) r
  where m.id = r.id and m.locked is distinct from r.over;
end;
$$;

-- Sets quota and locks from the subscription; called by the webhook after it
-- writes public.subscriptions.
create function public.apply_plan(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set storage_quota_bytes = case when public.has_plus(p_user_id) then 107374182400 else 2147483648 end
  where id = p_user_id;
  perform public.refresh_media_locks(p_user_id);
end;
$$;

-- Deleting media can bring later media back under the free 2 GiB.
create function public.media_after_delete_refresh_locks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.media where uploader_id = old.uploader_id and locked) then
    perform public.refresh_media_locks(old.uploader_id);
  end if;
  return null;
end;
$$;

create trigger media_refresh_locks_after_delete
  after delete on public.media
  for each row execute function public.media_after_delete_refresh_locks();

-- Locked files can't be fetched by anyone through the API.
drop policy "media objects: readable with their media row" on storage.objects;
create policy "media objects: readable with their media row"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    -- public.media is itself under RLS, so this only matches rows the user can read.
    and exists (
      select 1 from public.media m
      where (m.storage_path = storage.objects.name or m.thumb_path = storage.objects.name)
        and not m.locked
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges & RLS
-- ---------------------------------------------------------------------------
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

alter table public.subscriptions enable row level security;
create policy "subscriptions: read your own"
  on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

revoke execute on function
  public.has_plus(uuid),
  public.refresh_media_locks(uuid),
  public.apply_plan(uuid),
  public.media_after_delete_refresh_locks()
  from public, anon, authenticated;
-- The webhook uses the service role; it calls apply_plan.
grant execute on function public.apply_plan(uuid) to service_role;
grant execute on function public.has_plus(uuid) to service_role;
