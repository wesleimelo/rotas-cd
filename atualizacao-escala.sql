-- =====================================================================
-- Rotas do CD: atualização "escala de rotas".
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nenhum dado.
-- =====================================================================

-- ---------- escala de rotas (quem/qual veículo roda em cada dia) ----------
create table if not exists public.schedule (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  label text not null check (char_length(label) between 1 and 30),
  time_text text check (time_text is null or char_length(time_text) <= 12),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  plate text not null,
  driver_id uuid references public.profiles(id) on delete set null,
  driver_name text,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists schedule_day_idx on public.schedule(day);
alter table public.schedule enable row level security;

drop policy if exists schedule_read on public.schedule;
create policy schedule_read on public.schedule
  for select to authenticated using (public.is_coord() or public.is_active_user());
drop policy if exists schedule_coord_insert on public.schedule;
create policy schedule_coord_insert on public.schedule
  for insert to authenticated with check (public.is_coord());
drop policy if exists schedule_coord_update on public.schedule;
create policy schedule_coord_update on public.schedule
  for update to authenticated using (public.is_coord()) with check (public.is_coord());
drop policy if exists schedule_coord_delete on public.schedule;
create policy schedule_coord_delete on public.schedule
  for delete to authenticated using (public.is_coord());
revoke all on public.schedule from anon;
grant select, insert, update, delete on public.schedule to authenticated;

-- Completa as placas cadastradas só com as 3 letras (para a escala e para a planilha).
update public.vehicles set plate = 'SEY4A76' where plate = 'SEY';
update public.vehicles set plate = 'UBG2B99' where plate = 'UBG';
update public.vehicles set plate = 'UCI3F14' where plate = 'UCI';

-- Tipo do veículo (define a imagem na escala) e aceite da rota pelo motorista.
alter table public.vehicles add column if not exists kind text not null default 'van';
alter table public.vehicles drop constraint if exists vehicles_kind_check;
alter table public.vehicles add constraint vehicles_kind_check check (kind in ('van', 'caminhao', 'moto'));
alter table public.schedule add column if not exists kind text not null default 'van';
alter table public.schedule add column if not exists accepted_at timestamptz;

update public.vehicles set kind = 'caminhao' where kind = 'van' and (name ilike 'caminh%' or plate = 'UBG2B99');
update public.vehicles set kind = 'moto' where kind = 'van' and name ilike 'moto%';

create or replace function public.accept_schedule(p_id uuid)
returns public.schedule
language plpgsql security definer set search_path = public
as $$
declare
  s public.schedule;
begin
  if not public.is_active_user() then raise exception 'Usuário sem acesso'; end if;
  select * into s from public.schedule where id = p_id for update;
  if not found or s.driver_id is distinct from auth.uid() then raise exception 'Esta rota não é sua'; end if;
  if s.day < (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Esta rota é de um dia que já passou'; end if;
  if s.accepted_at is null then
    update public.schedule set accepted_at = now() where id = p_id returning * into s;
  end if;
  return s;
end;
$$;
revoke all on function public.accept_schedule(uuid) from public, anon;
grant execute on function public.accept_schedule(uuid) to authenticated;
