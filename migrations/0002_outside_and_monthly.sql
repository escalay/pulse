-- What is public anyway, fetched once a day: the repository's stars and the downloads of its release files
create table outside (
  product text not null,
  day text not null,
  stars integer not null,
  downloads integer not null,
  primary key (product, day)
) without rowid;

-- Daily rows older than 13 months become these totals: how many instances had each value of each field that month.
-- No instance id survives the roll-up. field '' with value '' is the month's count of instances.
create table monthly (
  product text not null,
  month text not null,
  field text not null,
  value text not null,
  instances integer not null,
  primary key (product, month, field, value)
) without rowid;
