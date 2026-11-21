-- Lit Up stealth pilot schema (MD v1.1, ELON-DECISION LU-MD-v1.1-ITEMS-6-9-20261121-1546).
-- Apply once to the Supabase project (SQL editor or `supabase db push`).
-- Learners appear outside auth.users only as account_hash = HMAC-SHA256(ACCOUNT_HMAC_KEY, account_id).
-- Every "month" is the calendar month in Asia/Jakarta (WIB), resetting 00:00 WIB on the 1st.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  account_id uuid primary key references auth.users (id) on delete cascade,
  account_hash text not null unique check (account_hash ~ '^[0-9a-f]{64}$'),
  display_name text check (char_length(display_name) <= 60),
  created_at timestamptz not null default now(),
  pilot boolean not null default false
);

-- SHA-256 of normalized allowlisted emails, synced from ALLOWLIST_EMAILS by
-- scripts/sync-allowlist.mjs. Read only by the before-user-created auth hook.
create table public.allowlist_hashes (
  email_sha256 text primary key check (email_sha256 ~ '^[0-9a-f]{64}$'),
  added_at timestamptz not null default now()
);

create table public.trial_sessions (
  id bigint generated always as identity primary key,
  account_hash text not null,
  session_no smallint not null check (session_no in (1, 2)),
  started_at timestamptz not null,
  last_message_at timestamptz not null,
  ended_at timestamptz,
  guru_messages int not null default 0 check (guru_messages >= 0),
  unique (account_hash, session_no)
);

create table public.usage_counters (
  account_hash text not null,
  period_type text not null check (period_type in ('day', 'month')),
  period_start date not null,
  guru_messages int not null default 0 check (guru_messages >= 0),
  short_responses int not null default 0 check (short_responses >= 0),
  primary key (account_hash, period_type, period_start)
);

-- The single durable shared total for the Rp4m alert and Rp5m hard stop.
create table public.spend_month (
  month_start date primary key check (extract(day from month_start) = 1),
  settled_idr bigint not null default 0 check (settled_idr >= 0),
  outstanding_idr bigint not null default 0 check (outstanding_idr >= 0),
  alert_sent_at timestamptz,
  hard_stop_at timestamptz
);

create table public.spend_ledger (
  id bigint generated always as identity primary key,
  month_start date not null references public.spend_month (month_start),
  -- Set to null on account deletion; the amounts stay as ID-less aggregates.
  account_hash text,
  request_id text not null unique,
  kind text check (kind in ('trial', 'free_short', 'pilot', 'pilot_trial')),
  reserved_idr int not null check (reserved_idr > 0),
  settled_idr int check (settled_idr >= 0),
  status text not null check (status in ('reserved', 'settled', 'released')),
  model text,
  tokens_in int,
  tokens_out int,
  thinking_tokens int,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index spend_ledger_account_idx on public.spend_ledger (account_hash);
create index spend_ledger_open_idx on public.spend_ledger (status) where status = 'reserved';

-- Props are validated server-side against a per-event key allowlist: no raw
-- email, IP or learner free text is ever written here.
create table public.events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  account_hash text,
  name text not null check (name ~ '^[a-z_]{2,40}$'),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object'),
  app_version text not null,
  env text not null check (env in ('preview', 'production', 'development'))
);
create index events_account_ts_idx on public.events (account_hash, ts desc);
create index events_name_ts_idx on public.events (name, ts desc);

create table public.deletion_log (
  id bigint generated always as identity primary key,
  account_hash text not null,
  requested_at timestamptz not null,
  completed_at timestamptz,
  method text not null check (method in ('manual', 'in_app'))
);

-- Fixed-window counters. key_hash is an HMAC of the account hash or client IP.
create table public.rate_limits (
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (scope, key_hash, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Time helpers (WIB)
-- ---------------------------------------------------------------------------

create function public.wib_month_start(p_now timestamptz)
returns date
language sql
stable
set search_path = pg_catalog, public
as $$
  select date_trunc('month', p_now at time zone 'Asia/Jakarta')::date
$$;

create function public.wib_day(p_now timestamptz)
returns date
language sql
stable
set search_path = pg_catalog, public
as $$
  select (p_now at time zone 'Asia/Jakarta')::date
$$;

-- ---------------------------------------------------------------------------
-- Allowlist cap: at most 13 test accounts (ELON-REVIEW LU-MD-FINAL-20261121-1556)
-- ---------------------------------------------------------------------------

create function public.enforce_allowlist_max()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (select count(*) from public.allowlist_hashes) > 13 then
    raise exception 'allowlist is capped at 13 accounts' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create trigger allowlist_max_13
after insert on public.allowlist_hashes
for each statement execute function public.enforce_allowlist_max();

-- ---------------------------------------------------------------------------
-- Spend reservation (LEO-QA-PROPOSAL LU-HARDSTOP-CONCURRENCY-20261121)
-- Lock order everywhere: spend_month row first, then ledger rows.
-- ---------------------------------------------------------------------------

create function public.reserve_spend(
  p_request_id text,
  p_account_hash text,
  p_amount_idr int,
  p_hard_stop_idr bigint,
  p_kind text default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_month date := public.wib_month_start(p_now);
  v_row public.spend_month%rowtype;
  v_existing public.spend_ledger%rowtype;
begin
  if p_request_id is null or length(p_request_id) = 0 then
    raise exception 'request_id required';
  end if;
  if p_amount_idr is null or p_amount_idr <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_hard_stop_idr is null or p_hard_stop_idr <= 0 then
    raise exception 'hard stop must be positive';
  end if;

  insert into public.spend_month (month_start) values (v_month) on conflict do nothing;
  select * into v_row from public.spend_month where month_start = v_month for update;

  select * into v_existing from public.spend_ledger where request_id = p_request_id;
  if found then
    -- A replayed request never gets a second dispatch on the same reservation.
    return jsonb_build_object(
      'ok', false, 'reason', 'duplicate_request', 'status', v_existing.status,
      'month_start', v_month
    );
  end if;

  if v_row.settled_idr + v_row.outstanding_idr + p_amount_idr > p_hard_stop_idr then
    update public.spend_month set hard_stop_at = coalesce(hard_stop_at, p_now)
      where month_start = v_month;
    return jsonb_build_object(
      'ok', false, 'reason', 'hard_stop', 'month_start', v_month,
      'settled_idr', v_row.settled_idr, 'outstanding_idr', v_row.outstanding_idr
    );
  end if;

  insert into public.spend_ledger (month_start, account_hash, request_id, kind, reserved_idr, status, created_at)
  values (v_month, p_account_hash, p_request_id, p_kind, p_amount_idr, 'reserved', p_now);

  update public.spend_month set outstanding_idr = outstanding_idr + p_amount_idr
    where month_start = v_month
    returning * into v_row;

  return jsonb_build_object(
    'ok', true, 'month_start', v_month,
    'settled_idr', v_row.settled_idr, 'outstanding_idr', v_row.outstanding_idr,
    'headroom_idr', p_hard_stop_idr - v_row.settled_idr - v_row.outstanding_idr
  );
end;
$$;

-- Settles a reservation exactly once, against the month it was reserved in.
-- Fires the monthly alert at most once per month.
create function public.settle_spend(
  p_request_id text,
  p_settled_idr int,
  p_model text default null,
  p_tokens_in int default null,
  p_tokens_out int default null,
  p_thinking_tokens int default null,
  p_alert_idr bigint default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_month date;
  v_ledger public.spend_ledger%rowtype;
  v_row public.spend_month%rowtype;
  v_alert boolean := false;
begin
  if p_settled_idr is null or p_settled_idr < 0 then
    raise exception 'settled amount must be >= 0';
  end if;

  select month_start into v_month from public.spend_ledger where request_id = p_request_id;
  if not found then
    raise exception 'unknown request_id';
  end if;

  perform 1 from public.spend_month where month_start = v_month for update;
  select * into v_ledger from public.spend_ledger where request_id = p_request_id for update;

  if v_ledger.status <> 'reserved' then
    return jsonb_build_object('ok', false, 'reason', 'already_closed', 'status', v_ledger.status);
  end if;

  update public.spend_ledger
     set status = 'settled', settled_idr = p_settled_idr, model = p_model,
         tokens_in = p_tokens_in, tokens_out = p_tokens_out,
         thinking_tokens = p_thinking_tokens, settled_at = p_now
   where id = v_ledger.id;

  update public.spend_month
     set outstanding_idr = outstanding_idr - v_ledger.reserved_idr,
         settled_idr = settled_idr + p_settled_idr
   where month_start = v_month
   returning * into v_row;

  if p_alert_idr is not null and v_row.alert_sent_at is null and v_row.settled_idr >= p_alert_idr then
    update public.spend_month set alert_sent_at = p_now where month_start = v_month;
    v_alert := true;
  end if;

  return jsonb_build_object(
    'ok', true, 'month_start', v_month, 'settled_idr', v_row.settled_idr,
    'outstanding_idr', v_row.outstanding_idr, 'alert_fired', v_alert
  );
end;
$$;

-- Releases a reservation when the provider confirmed no charge.
create function public.release_spend(
  p_request_id text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_month date;
  v_ledger public.spend_ledger%rowtype;
begin
  select month_start into v_month from public.spend_ledger where request_id = p_request_id;
  if not found then
    raise exception 'unknown request_id';
  end if;

  perform 1 from public.spend_month where month_start = v_month for update;
  select * into v_ledger from public.spend_ledger where request_id = p_request_id for update;

  if v_ledger.status <> 'reserved' then
    return jsonb_build_object('ok', false, 'reason', 'already_closed', 'status', v_ledger.status);
  end if;

  update public.spend_ledger set status = 'released', settled_idr = 0, settled_at = p_now
   where id = v_ledger.id;
  update public.spend_month set outstanding_idr = outstanding_idr - v_ledger.reserved_idr
   where month_start = v_month;

  return jsonb_build_object('ok', true, 'month_start', v_month);
end;
$$;

-- ---------------------------------------------------------------------------
-- Guruku admission: caps + spend reservation in one transaction.
-- p_mode: 'trial' (2-session trial, then free short responses) or 'pilot'
-- (PILOT_CAPS_LIFTED). The hard stop counts every account in both modes.
-- p_caps keys: trial_session_msg_cap, trial_sessions, session_idle_minutes,
--              free_monthly_short_cap, pilot_daily_msg_cap
-- Every admitted call (including a learner's retry) consumes one message.
-- With caps lifted nobody is in a trial, so a pilot learner's first
-- trial_sessions x trial_session_msg_cap charged (not released) calls are ledgered as 'pilot_trial'
-- and Metric 4 still gets one trial-sized unit per learner.
-- ---------------------------------------------------------------------------

create function public.admit_guru_call(
  p_request_id text,
  p_account_hash text,
  p_mode text,
  p_caps jsonb,
  p_amount_idr int,
  p_hard_stop_idr bigint,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_session_cap int := (p_caps ->> 'trial_session_msg_cap')::int;
  v_sessions int := coalesce((p_caps ->> 'trial_sessions')::int, 2);
  v_idle interval := make_interval(mins => coalesce((p_caps ->> 'session_idle_minutes')::int, 30));
  v_free_cap int := (p_caps ->> 'free_monthly_short_cap')::int;
  v_pilot_cap int := (p_caps ->> 'pilot_daily_msg_cap')::int;
  v_day date := public.wib_day(p_now);
  v_month date := public.wib_month_start(p_now);
  v_open public.trial_sessions%rowtype;
  v_closed jsonb := '[]'::jsonb;
  v_used_sessions int;
  v_session_no int;
  v_new_session boolean := false;
  v_count int;
  v_reserve jsonb;
  v_ended boolean := false;
  v_ledger_kind text;
begin
  if p_mode not in ('trial', 'pilot') then
    raise exception 'unknown mode %', p_mode;
  end if;

  -- One admission at a time per account (parallel tabs cannot overrun a cap).
  perform pg_advisory_xact_lock(hashtextextended('guru:' || p_account_hash, 0));

  if p_mode = 'pilot' then
    if v_pilot_cap is null then raise exception 'pilot_daily_msg_cap required'; end if;
    select guru_messages into v_count from public.usage_counters
     where account_hash = p_account_hash and period_type = 'day' and period_start = v_day;
    v_count := coalesce(v_count, 0);
    if v_count >= v_pilot_cap then
      return jsonb_build_object('ok', false, 'reason', 'cap', 'cap', 'pilot_daily', 'used', v_count, 'limit', v_pilot_cap);
    end if;

    v_ledger_kind := 'pilot';
    if v_session_cap is not null then
      select case when count(*) < v_session_cap * v_sessions then 'pilot_trial' else 'pilot' end
        into v_ledger_kind
        from public.spend_ledger
       where account_hash = p_account_hash and kind in ('trial', 'pilot_trial') and status <> 'released'
         and request_id <> p_request_id;
    end if;
    v_reserve := public.reserve_spend(p_request_id, p_account_hash, p_amount_idr, p_hard_stop_idr, v_ledger_kind, p_now);
    if not (v_reserve ->> 'ok')::boolean then
      return v_reserve;
    end if;

    insert into public.usage_counters (account_hash, period_type, period_start, guru_messages)
    values (p_account_hash, 'day', v_day, 1)
    on conflict (account_hash, period_type, period_start)
    do update set guru_messages = public.usage_counters.guru_messages + 1;

    return jsonb_build_object('ok', true, 'kind', 'normal', 'mode', 'pilot',
      'used', v_count + 1, 'limit', v_pilot_cap, 'month_start', v_month, 'closed_sessions', v_closed);
  end if;

  if v_session_cap is null or v_free_cap is null then
    raise exception 'trial caps required';
  end if;

  -- Close a trial session that went idle or reached its cap.
  select * into v_open from public.trial_sessions
   where account_hash = p_account_hash and ended_at is null
   order by session_no desc limit 1
   for update;
  if found and (v_open.last_message_at + v_idle <= p_now or v_open.guru_messages >= v_session_cap) then
    update public.trial_sessions set ended_at = p_now where id = v_open.id;
    v_closed := v_closed || jsonb_build_array(jsonb_build_object(
      'session_no', v_open.session_no, 'guru_messages', v_open.guru_messages));
    v_open := null;
  end if;

  if v_open.id is not null then
    v_session_no := v_open.session_no;
  else
    select count(*) into v_used_sessions from public.trial_sessions where account_hash = p_account_hash;
    if v_used_sessions < v_sessions then
      v_session_no := v_used_sessions + 1;
      v_new_session := true;
    end if;
  end if;

  if v_session_no is not null then
    v_reserve := public.reserve_spend(p_request_id, p_account_hash, p_amount_idr, p_hard_stop_idr, 'trial', p_now);
    if not (v_reserve ->> 'ok')::boolean then
      return v_reserve || jsonb_build_object('closed_sessions', v_closed);
    end if;

    if v_new_session then
      insert into public.trial_sessions (account_hash, session_no, started_at, last_message_at, guru_messages)
      values (p_account_hash, v_session_no, p_now, p_now, 1)
      returning guru_messages into v_count;
    else
      update public.trial_sessions
         set guru_messages = guru_messages + 1, last_message_at = p_now
       where id = v_open.id
       returning guru_messages into v_count;
    end if;

    if v_count >= v_session_cap then
      update public.trial_sessions set ended_at = p_now
       where account_hash = p_account_hash and session_no = v_session_no;
      v_ended := true;
    end if;

    return jsonb_build_object('ok', true, 'kind', 'normal', 'mode', 'trial',
      'session_no', v_session_no, 'session_started', v_new_session, 'session_ended', v_ended,
      'used', v_count, 'limit', v_session_cap, 'month_start', v_month, 'closed_sessions', v_closed);
  end if;

  -- Trial used up: free tier, short responses per WIB calendar month.
  select short_responses into v_count from public.usage_counters
   where account_hash = p_account_hash and period_type = 'month' and period_start = v_month;
  v_count := coalesce(v_count, 0);
  if v_count >= v_free_cap then
    return jsonb_build_object('ok', false, 'reason', 'cap', 'cap', 'free_monthly',
      'used', v_count, 'limit', v_free_cap, 'closed_sessions', v_closed);
  end if;

  v_reserve := public.reserve_spend(p_request_id, p_account_hash, p_amount_idr, p_hard_stop_idr, 'free_short', p_now);
  if not (v_reserve ->> 'ok')::boolean then
    return v_reserve || jsonb_build_object('closed_sessions', v_closed);
  end if;

  insert into public.usage_counters (account_hash, period_type, period_start, short_responses)
  values (p_account_hash, 'month', v_month, 1)
  on conflict (account_hash, period_type, period_start)
  do update set short_responses = public.usage_counters.short_responses + 1;

  return jsonb_build_object('ok', true, 'kind', 'short', 'mode', 'free',
    'used', v_count + 1, 'limit', v_free_cap, 'month_start', v_month, 'closed_sessions', v_closed);
end;
$$;

-- Learner taps "Akhiri sesi".
create function public.end_trial_session(
  p_account_hash text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_open public.trial_sessions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('guru:' || p_account_hash, 0));
  select * into v_open from public.trial_sessions
   where account_hash = p_account_hash and ended_at is null
   order by session_no desc limit 1
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_open_session');
  end if;
  update public.trial_sessions set ended_at = p_now where id = v_open.id;
  return jsonb_build_object('ok', true, 'session_no', v_open.session_no, 'guru_messages', v_open.guru_messages);
end;
$$;

-- Read-only status for the Guruku and Belajarku screens.
create function public.guru_status(
  p_account_hash text,
  p_mode text,
  p_caps jsonb,
  p_amount_idr int,
  p_hard_stop_idr bigint,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_idle interval := make_interval(mins => coalesce((p_caps ->> 'session_idle_minutes')::int, 30));
  v_session_cap int := (p_caps ->> 'trial_session_msg_cap')::int;
  v_month date := public.wib_month_start(p_now);
  v_spend public.spend_month%rowtype;
  v_open public.trial_sessions%rowtype;
  v_used_sessions int;
  v_count int;
  v_hard_stop boolean;
begin
  select * into v_spend from public.spend_month where month_start = v_month;
  v_hard_stop := coalesce(v_spend.settled_idr, 0) + coalesce(v_spend.outstanding_idr, 0) + p_amount_idr > p_hard_stop_idr;

  if p_mode = 'pilot' then
    select guru_messages into v_count from public.usage_counters
     where account_hash = p_account_hash and period_type = 'day' and period_start = public.wib_day(p_now);
    return jsonb_build_object('mode', 'pilot', 'used', coalesce(v_count, 0),
      'limit', (p_caps ->> 'pilot_daily_msg_cap')::int, 'hard_stop', v_hard_stop);
  end if;

  select count(*) into v_used_sessions from public.trial_sessions where account_hash = p_account_hash;
  select * into v_open from public.trial_sessions
   where account_hash = p_account_hash and ended_at is null
     and last_message_at + v_idle > p_now and guru_messages < v_session_cap
   order by session_no desc limit 1;

  if found then
    return jsonb_build_object('mode', 'trial', 'session_no', v_open.session_no, 'session_open', true,
      'used', v_open.guru_messages, 'limit', v_session_cap, 'sessions_used', v_used_sessions,
      'trial_sessions', coalesce((p_caps ->> 'trial_sessions')::int, 2), 'hard_stop', v_hard_stop);
  end if;

  if v_used_sessions < coalesce((p_caps ->> 'trial_sessions')::int, 2) then
    return jsonb_build_object('mode', 'trial', 'session_no', v_used_sessions + 1, 'session_open', false,
      'used', 0, 'limit', v_session_cap, 'sessions_used', v_used_sessions,
      'trial_sessions', coalesce((p_caps ->> 'trial_sessions')::int, 2), 'hard_stop', v_hard_stop);
  end if;

  select short_responses into v_count from public.usage_counters
   where account_hash = p_account_hash and period_type = 'month' and period_start = v_month;
  return jsonb_build_object('mode', 'free', 'used', coalesce(v_count, 0),
    'limit', (p_caps ->> 'free_monthly_short_cap')::int, 'sessions_used', v_used_sessions,
    'hard_stop', v_hard_stop);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed windows, stored in the database; no extra service)
-- ---------------------------------------------------------------------------

create function public.rate_limit_hit(
  p_scope text,
  p_key_hash text,
  p_limit int,
  p_window_seconds int,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits (scope, key_hash, window_start, hits)
  values (p_scope, p_key_hash, v_window, 1)
  on conflict (scope, key_hash, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  delete from public.rate_limits where window_start < p_now - interval '1 hour';

  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deletion ("Hapus akun & data"). The caller deletes the auth.users row via
-- the Supabase admin API afterwards, which cascades nothing else: every
-- learner-linked row is removed here. Cost totals stay as ID-less aggregates.
-- ---------------------------------------------------------------------------

create function public.delete_account_data(
  p_account_hash text,
  p_method text,
  p_requested_at timestamptz default null,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_events int;
  v_sessions int;
  v_counters int;
  v_rate int;
  v_ledger int;
  v_profiles int;
  v_deletion_id bigint;
begin
  if p_account_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid account hash';
  end if;
  delete from public.events where account_hash = p_account_hash;
  get diagnostics v_events = row_count;
  delete from public.trial_sessions where account_hash = p_account_hash;
  get diagnostics v_sessions = row_count;
  delete from public.usage_counters where account_hash = p_account_hash;
  get diagnostics v_counters = row_count;
  delete from public.rate_limits where key_hash = p_account_hash;
  get diagnostics v_rate = row_count;
  update public.spend_ledger set account_hash = null where account_hash = p_account_hash;
  get diagnostics v_ledger = row_count;
  delete from public.profiles where account_hash = p_account_hash;
  get diagnostics v_profiles = row_count;

  insert into public.deletion_log (account_hash, requested_at, completed_at, method)
  values (p_account_hash, coalesce(p_requested_at, p_now), p_now, p_method)
  returning id into v_deletion_id;

  return jsonb_build_object('deletion_id', v_deletion_id, 'completed_at', p_now, 'events', v_events, 'trial_sessions', v_sessions,
    'usage_counters', v_counters, 'rate_limits', v_rate,
    'ledger_rows_anonymized', v_ledger, 'profiles', v_profiles);
end;
$$;

-- ---------------------------------------------------------------------------
-- Metric 4 (LIVE in stealth): p95 model cost per two-session trial unit
-- ('trial' rows, or a pilot learner's first trial-sized 'pilot_trial' rows),
-- compared with COST_P95_TRIAL_MAX_IDR by scripts/spend-status.mts.
-- Released calls (provider confirmed no charge) count neither as calls nor cost.
-- A unit is full at p_unit_calls charged calls (sessions x per-session cap), or
-- when a trial learner's p_unit_sessions sessions have all ended; otherwise partial.
-- ---------------------------------------------------------------------------

create function public.metric4_trial_cost(p_unit_calls int default 28, p_unit_sessions int default 2)
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
  with per_unit as (
    select l.account_hash, count(*) as calls, sum(coalesce(l.settled_idr, l.reserved_idr)) as cost_idr
      from public.spend_ledger l
     where l.kind in ('trial', 'pilot_trial') and l.account_hash is not null and l.status <> 'released'
     group by l.account_hash
  ),
  graded as (
    select u.cost_idr,
           u.calls >= p_unit_calls
             or (select count(*) from public.trial_sessions s
                  where s.account_hash = u.account_hash and s.ended_at is not null) >= p_unit_sessions as full_unit
      from per_unit u
  )
  select jsonb_build_object(
    'learners', count(*),
    'full_units', count(*) filter (where full_unit),
    'partial_units', count(*) filter (where not full_unit),
    'unit_calls', p_unit_calls,
    'p95_idr', coalesce(percentile_cont(0.95) within group (order by cost_idr), 0),
    'max_idr', coalesce(max(cost_idr), 0)
  )
  from graded
$$;

-- ---------------------------------------------------------------------------
-- Supabase Auth "before user created" hook: blocks account creation for any
-- email that is not on the allowlist. Enable it in Authentication > Hooks.
-- ---------------------------------------------------------------------------

create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_email = '' or not exists (
    select 1 from public.allowlist_hashes
     where email_sha256 = encode(sha256(convert_to(v_email, 'UTF8')), 'hex')
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Lit Up sedang dalam uji internal. Pendaftaran belum dibuka.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security and privileges. The browser (anon/authenticated) can
-- read only its own profile row; everything else goes through server code
-- using the service role.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.allowlist_hashes enable row level security;
alter table public.trial_sessions enable row level security;
alter table public.usage_counters enable row level security;
alter table public.spend_month enable row level security;
alter table public.spend_ledger enable row level security;
alter table public.events enable row level security;
alter table public.deletion_log enable row level security;
alter table public.rate_limits enable row level security;

revoke all on table
  public.profiles, public.allowlist_hashes, public.trial_sessions, public.usage_counters,
  public.spend_month, public.spend_ledger, public.events, public.deletion_log, public.rate_limits
from anon, authenticated;

grant select on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using (account_id = auth.uid());

grant all on table
  public.profiles, public.allowlist_hashes, public.trial_sessions, public.usage_counters,
  public.spend_month, public.spend_ledger, public.events, public.deletion_log, public.rate_limits
to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke execute on function
  public.wib_month_start(timestamptz), public.wib_day(timestamptz),
  public.enforce_allowlist_max(),
  public.reserve_spend(text, text, int, bigint, text, timestamptz),
  public.settle_spend(text, int, text, int, int, int, bigint, timestamptz),
  public.release_spend(text, timestamptz),
  public.admit_guru_call(text, text, text, jsonb, int, bigint, timestamptz),
  public.end_trial_session(text, timestamptz),
  public.guru_status(text, text, jsonb, int, bigint, timestamptz),
  public.rate_limit_hit(text, text, int, int, timestamptz),
  public.delete_account_data(text, text, timestamptz, timestamptz),
  public.metric4_trial_cost(int, int),
  public.hook_before_user_created(jsonb)
from public, anon, authenticated;

grant execute on function
  public.wib_month_start(timestamptz), public.wib_day(timestamptz),
  public.reserve_spend(text, text, int, bigint, text, timestamptz),
  public.settle_spend(text, int, text, int, int, int, bigint, timestamptz),
  public.release_spend(text, timestamptz),
  public.admit_guru_call(text, text, text, jsonb, int, bigint, timestamptz),
  public.end_trial_session(text, timestamptz),
  public.guru_status(text, text, jsonb, int, bigint, timestamptz),
  public.rate_limit_hit(text, text, int, int, timestamptz),
  public.delete_account_data(text, text, timestamptz, timestamptz),
  public.metric4_trial_cost(int, int)
to service_role;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant select on table public.allowlist_hashes to supabase_auth_admin;
create policy allowlist_hashes_auth_admin_read on public.allowlist_hashes
  for select to supabase_auth_admin using (true);
