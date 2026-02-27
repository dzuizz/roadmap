-- Ada Roadmap Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Roadmaps table
create table public.roadmaps (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  root_node_id uuid,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Nodes table
create table public.nodes (
  id uuid default uuid_generate_v4() primary key,
  roadmap_id uuid references public.roadmaps(id) on delete cascade not null,
  parent_id uuid references public.nodes(id) on delete cascade,
  path text not null default '',
  position integer not null default 0,
  title text not null default 'Untitled',
  description text,
  link text,
  is_completed boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  deleted_at timestamptz
);

-- Trash entries table
create table public.trash_entries (
  id uuid default uuid_generate_v4() primary key,
  roadmap_id uuid references public.roadmaps(id) on delete cascade not null,
  node_snapshot jsonb not null,
  parent_id uuid,
  original_node_id uuid not null,
  deleted_at timestamptz default now() not null,
  expires_at timestamptz not null
);

-- Add foreign key from roadmaps to nodes (after nodes table exists)
alter table public.roadmaps
  add constraint roadmaps_root_node_id_fkey
  foreign key (root_node_id) references public.nodes(id) on delete set null;

-- Indexes
create index idx_roadmaps_user_id on public.roadmaps(user_id);
create index idx_nodes_roadmap_id on public.nodes(roadmap_id);
create index idx_nodes_parent_id on public.nodes(parent_id);
create index idx_nodes_path on public.nodes(path varchar_pattern_ops);
create index idx_nodes_deleted_at on public.nodes(roadmap_id, deleted_at);
create index idx_trash_entries_roadmap_id on public.trash_entries(roadmap_id);
create index idx_trash_entries_expires_at on public.trash_entries(expires_at);

-- Updated_at trigger function
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger roadmaps_updated_at
  before update on public.roadmaps
  for each row execute function public.handle_updated_at();

create trigger nodes_updated_at
  before update on public.nodes
  for each row execute function public.handle_updated_at();

-- Row Level Security
alter table public.roadmaps enable row level security;
alter table public.nodes enable row level security;
alter table public.trash_entries enable row level security;

-- RLS Policies: Users can only access their own data
create policy "Users can view their own roadmaps"
  on public.roadmaps for select
  using (auth.uid() = user_id);

create policy "Users can create their own roadmaps"
  on public.roadmaps for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own roadmaps"
  on public.roadmaps for update
  using (auth.uid() = user_id);

create policy "Users can delete their own roadmaps"
  on public.roadmaps for delete
  using (auth.uid() = user_id);

-- Node policies: access through roadmap ownership
create policy "Users can view nodes in their roadmaps"
  on public.nodes for select
  using (
    exists (
      select 1 from public.roadmaps
      where roadmaps.id = nodes.roadmap_id
      and roadmaps.user_id = auth.uid()
    )
  );

create policy "Users can create nodes in their roadmaps"
  on public.nodes for insert
  with check (
    exists (
      select 1 from public.roadmaps
      where roadmaps.id = nodes.roadmap_id
      and roadmaps.user_id = auth.uid()
    )
  );

create policy "Users can update nodes in their roadmaps"
  on public.nodes for update
  using (
    exists (
      select 1 from public.roadmaps
      where roadmaps.id = nodes.roadmap_id
      and roadmaps.user_id = auth.uid()
    )
  );

create policy "Users can delete nodes in their roadmaps"
  on public.nodes for delete
  using (
    exists (
      select 1 from public.roadmaps
      where roadmaps.id = nodes.roadmap_id
      and roadmaps.user_id = auth.uid()
    )
  );

-- Trash entry policies
create policy "Users can view trash in their roadmaps"
  on public.trash_entries for select
  using (
    exists (
      select 1 from public.roadmaps
      where roadmaps.id = trash_entries.roadmap_id
      and roadmaps.user_id = auth.uid()
    )
  );

create policy "Users can create trash entries in their roadmaps"
  on public.trash_entries for insert
  with check (
    exists (
      select 1 from public.roadmaps
      where roadmaps.id = trash_entries.roadmap_id
      and roadmaps.user_id = auth.uid()
    )
  );

create policy "Users can delete trash entries in their roadmaps"
  on public.trash_entries for delete
  using (
    exists (
      select 1 from public.roadmaps
      where roadmaps.id = trash_entries.roadmap_id
      and roadmaps.user_id = auth.uid()
    )
  );
