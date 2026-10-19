-- Core identity and access model: profiles, child profiles, guardians and invitations.
-- Every read/write from the app goes through RLS; privileged multi-row operations
-- (creating a child, accepting an invitation) go through SECURITY DEFINER functions.

create extension if not exists citext with schema extensions;

-- Ordered from least to most privileged so roles can be compared with >=.
create type public.member_role as enum ('viewer', 'editor', 'owner');

-- Ordered from most to least restrictive so a post's visibility can be capped
-- by the child's max_visibility with <=.
create type public.visibility as enum ('private', 'family', 'link', 'public');

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (the parent/guardian account)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  -- Set when the user confirms at sign-up that they are an adult parent/guardian.
  guardian_attested_at timestamptz,
  storage_used_bytes bigint not null default 0,
  storage_quota_bytes bigint not null default 2147483648, -- 2 GiB free tier
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, guardian_attested_at)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60),
    case when (new.raw_user_meta_data ->> 'guardian_attested')::boolean then now() end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- children: a child's growth profile
-- ---------------------------------------------------------------------------
create table public.children (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(btrim(nickname)) between 1 and 40),
  -- Never exposed on public pages; only used to show age ("5 years old").
  birth_date date check (birth_date <= current_date),
  avatar_path text,
  -- Upper bound for the visibility of anything posted on this profile.
  max_visibility public.visibility not null default 'family',
  -- When the creating guardian confirmed they are this child's parent/guardian.
  guardian_consent_at timestamptz not null default now(),
  -- Nullable so deleting an account doesn't block children handed over to other guardians.
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- child_members: who can see / edit / manage a child profile
-- ---------------------------------------------------------------------------
create table public.child_members (
  child_id uuid not null references public.children (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (child_id, user_id)
);

create index child_members_user_id_idx on public.child_members (user_id);

-- ---------------------------------------------------------------------------
-- invitations: an owner invites another adult by email
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  email extensions.citext not null check (email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null check (role in ('viewer', 'editor')),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);

create index invitations_child_id_idx on public.invitations (child_id);

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so policies on child_members can call them
-- without recursing into child_members' own policies.
-- ---------------------------------------------------------------------------
create function public.child_role(p_child_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.child_members
  where child_id = p_child_id and user_id = (select auth.uid());
$$;

create function public.has_child_role(p_child_id uuid, p_min_role public.member_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.child_role(p_child_id) >= p_min_role, false);
$$;

create function public.shares_child_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.child_members mine
    join public.child_members theirs on theirs.child_id = mine.child_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger children_touch_updated_at
  before update on public.children
  for each row execute function public.touch_updated_at();

-- A child profile must always keep at least one owner. Skipped when the child
-- itself is being deleted (cascade runs after the parent row is gone).
create function public.ensure_child_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.children where id = old.child_id)
     and not exists (
       select 1 from public.child_members
       where child_id = old.child_id and role = 'owner' and user_id <> old.user_id
     )
  then
    raise exception 'A child profile must keep at least one owner'
      using errcode = 'P0001', hint = 'last_owner';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger child_members_keep_owner
  before update or delete on public.child_members
  for each row execute function public.ensure_child_has_owner();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create function public.create_child(
  p_nickname text,
  p_birth_date date default null,
  p_max_visibility public.visibility default 'family'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_child_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.children (nickname, birth_date, max_visibility, created_by)
  values (btrim(p_nickname), p_birth_date, p_max_visibility, v_uid)
  returning id into v_child_id;

  insert into public.child_members (child_id, user_id, role)
  values (v_child_id, v_uid, 'owner');

  return v_child_id;
end;
$$;

-- Readable by anyone holding the token, so the invite page can explain what
-- the invitation is before the visitor signs in.
create function public.get_invitation(p_token text)
returns table (
  child_nickname text,
  inviter_name text,
  email text,
  role public.member_role,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.nickname,
    p.display_name,
    i.email::text,
    i.role,
    case
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'pending'
    end
  from public.invitations i
  join public.children c on c.id = i.child_id
  left join public.profiles p on p.id = i.invited_by
  where i.token = p_token;
$$;

create function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := (select auth.jwt() ->> 'email');
  v_inv public.invitations;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_inv from public.invitations where token = p_token for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0001', hint = 'not_found';
  elsif v_inv.accepted_at is not null then
    raise exception 'Invitation already used' using errcode = 'P0001', hint = 'accepted';
  elsif v_inv.expires_at < now() then
    raise exception 'Invitation expired' using errcode = 'P0001', hint = 'expired';
  elsif lower(coalesce(v_email, '')) <> lower(v_inv.email::text) then
    -- Invitations are bound to an email so a forwarded link can't be used by a stranger.
    raise exception 'Invitation was sent to a different email' using errcode = 'P0001', hint = 'email_mismatch';
  end if;

  -- Never downgrade an existing member.
  insert into public.child_members (child_id, user_id, role)
  values (v_inv.child_id, v_uid, v_inv.role)
  on conflict (child_id, user_id)
    do update set role = greatest(public.child_members.role, excluded.role);

  update public.invitations
  set accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  return v_inv.child_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, grant only what the app needs.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.children, public.child_members, public.invitations
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, delete on public.children to authenticated;
grant update (nickname, birth_date, avatar_path, max_visibility) on public.children to authenticated;

grant select, delete on public.child_members to authenticated;
grant update (role) on public.child_members to authenticated;

grant select, insert, delete on public.invitations to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.child_role(uuid),
  public.has_child_role(uuid, public.member_role),
  public.shares_child_with(uuid),
  public.create_child(text, date, public.visibility),
  public.get_invitation(text),
  public.accept_invitation(text)
  to authenticated;
grant execute on function public.get_invitation(text) to anon;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.child_members enable row level security;
alter table public.invitations enable row level security;

-- profiles
create policy "profiles: read self and co-guardians"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_child_with(id));

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- children
create policy "children: members can read"
  on public.children for select to authenticated
  using (public.has_child_role(id, 'viewer'));

create policy "children: editors can update"
  on public.children for update to authenticated
  using (public.has_child_role(id, 'editor'))
  with check (public.has_child_role(id, 'editor'));

create policy "children: owners can delete"
  on public.children for delete to authenticated
  using (public.has_child_role(id, 'owner'));

-- child_members
create policy "members: members can read the member list"
  on public.child_members for select to authenticated
  using (public.has_child_role(child_id, 'viewer'));

create policy "members: owners can change roles"
  on public.child_members for update to authenticated
  using (public.has_child_role(child_id, 'owner'))
  with check (public.has_child_role(child_id, 'owner'));

create policy "members: owners remove others, anyone can leave"
  on public.child_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_child_role(child_id, 'owner'));

-- invitations
create policy "invitations: owners can read"
  on public.invitations for select to authenticated
  using (public.has_child_role(child_id, 'owner'));

create policy "invitations: owners can create"
  on public.invitations for insert to authenticated
  with check (public.has_child_role(child_id, 'owner') and invited_by = (select auth.uid()));

create policy "invitations: owners can revoke"
  on public.invitations for delete to authenticated
  using (public.has_child_role(child_id, 'owner'));
