-- Everything the Worker keeps. One row per instance per day (a second report the same day replaces the first),
-- and one row per instance saying when it was first and last seen. No address, no host name, no user.
create table reports (
  product text not null,
  instance text not null,
  day text not null,
  schema integer not null,
  version text not null,
  country text not null,
  fields text not null,
  primary key (product, instance, day)
) without rowid;

create index reports_by_day on reports (product, day);

create table instances (
  product text not null,
  instance text not null,
  first_day text not null,
  last_day text not null,
  first_version text not null,
  version text not null,
  primary key (product, instance)
) without rowid;

-- The newest release of each product, fetched once a day; reports are answered with it
create table releases (
  product text primary key,
  latest text not null,
  fetched_at text not null
) without rowid;
