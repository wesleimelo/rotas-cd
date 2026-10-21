-- =====================================================================
-- Rotas do CD: atualização "lançamento manual pela coordenação".
-- Rode UMA vez no SQL Editor do Supabase, se você já tinha rodado o
-- schema.sql antes desta versão. Não apaga nenhum dado.
-- =====================================================================

alter table public.routes
  add column if not exists start_by uuid references public.profiles(id) on delete set null,
  add column if not exists end_by   uuid references public.profiles(id) on delete set null;

create or replace function public.cancel_route(p_route uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.routes;
begin
  if not public.is_active_user() then raise exception 'Usuário sem acesso'; end if;

  select * into r from public.routes where id = p_route and status = 'open' for update;
  if not found then raise exception 'Rota não encontrada ou já finalizada'; end if;
  if r.driver_id <> auth.uid() and not public.is_coord() then
    raise exception 'Você não pode cancelar esta rota';
  end if;
  if r.start_by is not null and not public.is_coord() then
    raise exception 'Esta rota foi lançada pela coordenação. Peça a ela para corrigir';
  end if;

  delete from public.routes where id = p_route;
end;
$$;

create or replace function public.coord_start_route(p_vehicle uuid, p_driver uuid, p_km integer, p_photo text, p_at timestamptz default null)
returns public.routes
language plpgsql security definer set search_path = public
as $$
declare
  d public.profiles;
  v public.vehicles;
  r public.routes;
  t timestamptz;
begin
  if not public.is_coord() then raise exception 'Só a coordenação pode fazer isso'; end if;

  select * into d from public.profiles where id = p_driver and active and role = 'driver';
  if not found then raise exception 'Motorista não encontrado'; end if;

  select * into v from public.vehicles where id = p_vehicle and active;
  if not found then raise exception 'Veículo não encontrado'; end if;

  if p_km is null or p_km < 0 or p_km > 9999999 then raise exception 'Km inválido'; end if;
  if p_photo is null or p_photo not like auth.uid()::text || '/%' then raise exception 'Foto inválida'; end if;

  t := coalesce(p_at, now());
  if t > now() + interval '5 minutes' then raise exception 'A data e a hora não podem estar no futuro'; end if;
  if t < now() - interval '62 days' then raise exception 'Data muito antiga. Use no máximo os últimos 62 dias'; end if;

  if exists (select 1 from public.routes where vehicle_id = v.id and status = 'closed' and end_at > t) then
    raise exception 'Este veículo já tem uma rota registrada depois dessa data e hora. Ajuste o horário';
  end if;

  insert into public.routes (vehicle_id, driver_id, driver_name, plate, vehicle_name, start_km, start_at, start_photo, start_by)
  values (v.id, d.id, d.full_name, v.plate, v.name, p_km, t, p_photo, auth.uid())
  returning * into r;
  return r;
exception
  when unique_violation then
    raise exception 'Este veículo já está em rota';
end;
$$;

create or replace function public.coord_finish_route(p_route uuid, p_km integer, p_photo text, p_notes text, p_at timestamptz default null)
returns public.routes
language plpgsql security definer set search_path = public
as $$
declare
  r public.routes;
  t timestamptz;
begin
  if not public.is_coord() then raise exception 'Só a coordenação pode fazer isso'; end if;

  select * into r from public.routes where id = p_route and status = 'open' for update;
  if not found then raise exception 'Rota não encontrada ou já finalizada'; end if;

  if p_km is null or p_km > 9999999 then raise exception 'Km inválido'; end if;
  if p_km < r.start_km then raise exception 'O km final não pode ser menor que o inicial'; end if;
  if p_photo is null or p_photo not like auth.uid()::text || '/%' then raise exception 'Foto inválida'; end if;

  t := coalesce(p_at, now());
  if t > now() + interval '5 minutes' then raise exception 'A data e a hora não podem estar no futuro'; end if;
  if t < r.start_at then raise exception 'O fechamento não pode ser antes do início da rota'; end if;

  update public.routes
     set status = 'closed',
         end_km = p_km,
         end_at = t,
         end_photo = p_photo,
         end_by = auth.uid(),
         notes = nullif(left(trim(coalesce(p_notes, '')), 200), '')
   where id = p_route
   returning * into r;
  return r;
end;
$$;

-- O motorista também enxerga as fotos das próprias rotas lançadas pela coordenação.
drop policy if exists "fotos: ler" on storage.objects;
create policy "fotos: ler" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'odometer-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_coord()
      or exists (
        select 1 from public.routes r
        where r.driver_id = auth.uid()
          and (r.start_photo = storage.objects.name or r.end_photo = storage.objects.name)
      )
    )
  );

revoke all on function public.coord_start_route(uuid, uuid, integer, text, timestamptz) from public, anon;
revoke all on function public.coord_finish_route(uuid, integer, text, text, timestamptz) from public, anon;
grant execute on function public.coord_start_route(uuid, uuid, integer, text, timestamptz) to authenticated;
grant execute on function public.coord_finish_route(uuid, integer, text, text, timestamptz) to authenticated;
