-- Garage Detailing: bookings shared by the website and the Telegram bot.
-- Run once in the Supabase SQL editor (or via a migration).

create table if not exists public.bookings (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  source        text not null check (source in ('web', 'telegram')),
  lang          text not null default 'ru' check (lang in ('ru', 'uz', 'en')),
  service_id    text not null,
  booking_date  date not null,
  booking_time  time not null,
  name          text not null,
  phone         text not null,
  car           text,
  comment       text,
  telegram_id   bigint,
  reminded      boolean not null default false,
  status        text not null default 'new'
                check (status in ('new', 'confirmed', 'done', 'cancelled'))
);

-- One active booking per slot.
create unique index if not exists bookings_slot_unique
  on public.bookings (booking_date, booking_time)
  where status in ('new', 'confirmed');

create index if not exists bookings_telegram_idx on public.bookings (telegram_id);

-- Only the server (service_role key) touches this table; browsers never do.
alter table public.bookings enable row level security;
