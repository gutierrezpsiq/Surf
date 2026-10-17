-- Swell Sul — storage for the automatic pipeline.
-- The app itself reads only the precomputed JSON in the public `forecast` bucket.

create table if not exists runs (
  id bigserial primary key,
  generated_at timestamptz not null,
  sources jsonb not null default '[]',
  error text
);

-- Model forecasts at observation sites (≤ 72 h lead), for calibration
create table if not exists model_forecasts (
  run_at timestamptz not null,
  feed_id text not null,
  model text not null,
  valid_time timestamptz not null,
  hs real,
  tp real,
  primary key (run_at, feed_id, model, valid_time)
);
create index if not exists model_forecasts_valid on model_forecasts (valid_time);

create table if not exists observations (
  feed_id text not null,
  time timestamptz not null,
  hs real,
  tp real,
  dir real,
  primary key (feed_id, time)
);

create table if not exists calibration (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  endpoint text primary key,
  keys jsonb not null,
  prefs jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists notifications_sent (
  endpoint text not null references push_subscriptions (endpoint) on delete cascade,
  spot_id text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (endpoint, spot_id, day)
);

-- Lock everything down: only the service role (pipeline) reads/writes tables.
alter table runs enable row level security;
alter table model_forecasts enable row level security;
alter table observations enable row level security;
alter table calibration enable row level security;
alter table push_subscriptions enable row level security;
alter table notifications_sent enable row level security;

-- Devices register/unregister themselves through these functions only (no table access for anon).
create or replace function upsert_push_subscription(p_endpoint text, p_keys jsonb, p_prefs jsonb)
returns void language sql security definer set search_path = public as $$
  insert into push_subscriptions (endpoint, keys, prefs) values (p_endpoint, p_keys, p_prefs)
  on conflict (endpoint) do update set keys = excluded.keys, prefs = excluded.prefs;
$$;
create or replace function delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;
revoke all on function upsert_push_subscription(text, jsonb, jsonb) from public;
revoke all on function delete_push_subscription(text) from public;
grant execute on function upsert_push_subscription(text, jsonb, jsonb) to anon, authenticated;
grant execute on function delete_push_subscription(text) to anon, authenticated;

-- Public read-only bucket with the precomputed forecast JSON
insert into storage.buckets (id, name, public) values ('forecast', 'forecast', true)
on conflict (id) do nothing;

-- Keep history bounded
create or replace function prune_history() returns void language sql as $$
  delete from model_forecasts where valid_time < now() - interval '120 days';
  delete from observations where time < now() - interval '120 days';
  delete from runs where generated_at < now() - interval '60 days';
  delete from notifications_sent where day < current_date - 7;
$$;
