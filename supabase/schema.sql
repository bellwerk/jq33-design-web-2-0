create extension if not exists "pgcrypto";

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  form_type text not null check (form_type in ('contact', 'inquiry')),
  name text not null,
  email text not null,
  project_type text,
  message text,
  space_type text,
  project_goals text,
  name_business text,
  source_path text,
  user_agent text,
  ip_address text
);

create table if not exists public.portfolio_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slug text unique not null,
  title text not null,
  title_lines text[],
  hero_title_lines text[],
  year text,
  category text,
  meta_title text,
  meta_description text,
  summary text,
  sort_order integer not null default 0
);

create table if not exists public.portfolio_images (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  project_id uuid not null references public.portfolio_projects(id) on delete cascade,
  path text not null,
  alt text,
  caption text,
  sort_order integer not null default 0,
  is_hero boolean not null default false,
  is_preview boolean not null default false
);

create index if not exists portfolio_images_project_order_idx
  on public.portfolio_images (project_id, sort_order);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_portfolio_projects_updated_at on public.portfolio_projects;
create trigger set_portfolio_projects_updated_at
before update on public.portfolio_projects
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.leads enable row level security;
alter table public.portfolio_projects enable row level security;
alter table public.portfolio_images enable row level security;

create policy "Admin can read own row"
  on public.admin_users
  for select
  using (auth.role() = 'authenticated' and email = auth.email());

create policy "Portfolio projects are public"
  on public.portfolio_projects
  for select
  using (true);

create policy "Portfolio images are public"
  on public.portfolio_images
  for select
  using (true);

create policy "Admins can insert projects"
  on public.portfolio_projects
  for insert
  with check (exists (
    select 1 from public.admin_users
    where email = auth.email()
  ));

create policy "Admins can update projects"
  on public.portfolio_projects
  for update
  using (exists (
    select 1 from public.admin_users
    where email = auth.email()
  ))
  with check (exists (
    select 1 from public.admin_users
    where email = auth.email()
  ));

create policy "Admins can delete projects"
  on public.portfolio_projects
  for delete
  using (exists (
    select 1 from public.admin_users
    where email = auth.email()
  ));

create policy "Admins can insert images"
  on public.portfolio_images
  for insert
  with check (exists (
    select 1 from public.admin_users
    where email = auth.email()
  ));

create policy "Admins can update images"
  on public.portfolio_images
  for update
  using (exists (
    select 1 from public.admin_users
    where email = auth.email()
  ))
  with check (exists (
    select 1 from public.admin_users
    where email = auth.email()
  ));

create policy "Admins can delete images"
  on public.portfolio_images
  for delete
  using (exists (
    select 1 from public.admin_users
    where email = auth.email()
  ));

insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do update set public = true;

create policy "Portfolio storage is public"
  on storage.objects
  for select
  using (bucket_id = 'portfolio');

create policy "Admins can upload portfolio storage"
  on storage.objects
  for insert
  with check (
    bucket_id = 'portfolio'
    and exists (
      select 1 from public.admin_users
      where email = auth.email()
    )
  );

create policy "Admins can update portfolio storage"
  on storage.objects
  for update
  using (
    bucket_id = 'portfolio'
    and exists (
      select 1 from public.admin_users
      where email = auth.email()
    )
  )
  with check (
    bucket_id = 'portfolio'
    and exists (
      select 1 from public.admin_users
      where email = auth.email()
    )
  );

create policy "Admins can delete portfolio storage"
  on storage.objects
  for delete
  using (
    bucket_id = 'portfolio'
    and exists (
      select 1 from public.admin_users
      where email = auth.email()
    )
  );
