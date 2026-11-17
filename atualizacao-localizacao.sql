-- =====================================================================
-- Rotas do CD: localização do veículo durante a rota (app Android) + mapa da coordenação.
-- Rode UMA vez no SQL Editor do Supabase (depois dos outros atualizacao-*.sql).
-- Não apaga nenhum dado. Pode rodar de novo sem problema.
--
-- Regras:
--  * Só grava ponto enquanto a rota do motorista está ABERTA (iniciada e não finalizada).
--  * O motorista precisa ter aceito o aviso de localização (profiles.loc_consent_at).
--  * Só a coordenação enxerga os pontos (mapa e trajeto).
--  * Pontos com mais de 30 dias são apagados todo dia (pg_cron) ou pelo botão da coordenação.
-- =====================================================================

alter table public.profiles add column if not exists loc_consent_at timestamptz;

create table if not exists public.route_points (
  id         bigserial primary key,
  route_id   uuid not null references public.routes(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_id  uuid references auth.users(id) on delete set null,
  at         timestamptz not null default now(),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  accuracy   real,
  speed      real
);
create index if not exists route_points_route_at on public.route_points (route_id, at);
create index if not exists route_points_vehicle_at on public.route_points (vehicle_id, at desc);
create index if not exists route_points_at on public.route_points (at);

alter table public.route_points enable row level security;
drop policy if exists route_points_read on public.route_points;
create policy route_points_read on public.route_points
  for select to authenticated using (public.is_coord());
-- Ninguém escreve direto na tabela: só pela função log_points (abaixo).
revoke insert, update, delete on public.route_points from authenticated, anon;

-- O motorista aceita o aviso de localização (fica registrado quando).
create or replace function public.accept_location_consent()
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare t timestamptz;
begin
  if not public.is_active_user() then raise exception 'Usuário sem acesso'; end if;
  update public.profiles set loc_consent_at = coalesce(loc_consent_at, now())
   where id = auth.uid() returning loc_consent_at into t;
  return t;
end;
$$;
revoke all on function public.accept_location_consent() from public, anon;
grant execute on function public.accept_location_consent() to authenticated;

create or replace function public.my_location_consent()
returns timestamptz
language sql stable security definer set search_path = public
as $$ select loc_consent_at from public.profiles where id = auth.uid(); $$;
revoke all on function public.my_location_consent() from public, anon;
grant execute on function public.my_location_consent() to authenticated;

-- Recebe um ou vários pontos (o app junta os pontos se ficar sem internet e manda depois).
-- p_points: [{"lat":-23.4,"lng":-51.9,"acc":12,"spd":8.3,"at":"2026-11-18T12:00:00Z"}, ...]
-- Devolve quantos pontos foram gravados.
create or replace function public.log_points(p_route uuid, p_points jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r public.routes;
  e jsonb;
  n integer := 0;
  t timestamptz;
  la double precision;
  lo double precision;
  last_at timestamptz;
begin
  if not public.is_active_user() then raise exception 'Usuário sem acesso'; end if;
  if p_points is null or jsonb_typeof(p_points) <> 'array' then raise exception 'Pontos inválidos'; end if;
  if jsonb_array_length(p_points) > 200 then raise exception 'Pontos demais de uma vez'; end if;
  if (select loc_consent_at from public.profiles where id = auth.uid()) is null then
    raise exception 'Aceite o aviso de localização antes';
  end if;

  select * into r from public.routes where id = p_route and driver_id = auth.uid();
  if not found then raise exception 'Rota não encontrada'; end if;
  -- rota já finalizada: aceita só pontos de antes do fim (envio atrasado), nunca depois.

  select max(at) into last_at from public.route_points where route_id = p_route;

  for e in select * from jsonb_array_elements(p_points) loop
    la := nullif(e->>'lat', '')::double precision;
    lo := nullif(e->>'lng', '')::double precision;
    if la is null or lo is null or la not between -90 and 90 or lo not between -180 and 180 then continue; end if;
    t := coalesce(nullif(e->>'at', '')::timestamptz, now());
    if t < r.start_at or t > now() + interval '2 minutes' then continue; end if;
    if r.end_at is not null and t > r.end_at then continue; end if;
    -- evita pontos repetidos em menos de 10 s
    if last_at is not null and abs(extract(epoch from (t - last_at))) < 10 then continue; end if;
    insert into public.route_points (route_id, vehicle_id, driver_id, at, lat, lng, accuracy, speed)
    values (r.id, r.vehicle_id, r.driver_id, t, la, lo,
            nullif(e->>'acc', '')::real, nullif(e->>'spd', '')::real);
    last_at := t;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.log_points(uuid, jsonb) from public, anon;
grant execute on function public.log_points(uuid, jsonb) to authenticated;

-- Mapa ao vivo (coordenação): última posição de cada veículo com rota aberta.
create or replace function public.live_positions()
returns table (
  route_id uuid, vehicle_id uuid, plate text, vname text, kind text,
  driver_name text, field_status text, start_at timestamptz,
  lat double precision, lng double precision, at timestamptz, speed real
)
language sql stable security definer set search_path = public
as $$
  select r.id, r.vehicle_id, coalesce(v.plate, r.plate), coalesce(v.name, r.vehicle_name), coalesce(v.kind, 'van'),
         r.driver_name, r.field_status, r.start_at,
         p.lat, p.lng, p.at, p.speed
    from public.routes r
    left join public.vehicles v on v.id = r.vehicle_id
    left join lateral (
      select * from public.route_points x where x.route_id = r.id order by x.at desc limit 1
    ) p on true
   where r.status = 'open' and public.is_coord()
   order by 3;
$$;
revoke all on function public.live_positions() from public, anon;
grant execute on function public.live_positions() to authenticated;

-- Trajeto de uma rota (aberta ou já finalizada, enquanto os pontos existirem).
create or replace function public.route_track(p_route uuid)
returns table (lat double precision, lng double precision, at timestamptz, speed real)
language sql stable security definer set search_path = public
as $$
  select p.lat, p.lng, p.at, p.speed
    from public.route_points p
   where p.route_id = p_route and public.is_coord()
   order by p.at
   limit 5000;
$$;
revoke all on function public.route_track(uuid) from public, anon;
grant execute on function public.route_track(uuid) to authenticated;

-- Trilhas de todas as rotas abertas de uma vez (o mapa ao vivo desenha a linha por onde cada veículo passou).
create or replace function public.live_tracks()
returns table (route_id uuid, lat double precision, lng double precision, at timestamptz)
language sql stable security definer set search_path = public
as $$
  select x.route_id, x.lat, x.lng, x.at
    from (
      select p.route_id, p.lat, p.lng, p.at,
             row_number() over (partition by p.route_id order by p.at desc) as rn
        from public.route_points p
        join public.routes r on r.id = p.route_id and r.status = 'open'
       where public.is_coord()
    ) x
   where x.rn <= 2500
   order by x.route_id, x.at;
$$;
revoke all on function public.live_tracks() from public, anon;
grant execute on function public.live_tracks() to authenticated;

-- Apaga pontos antigos. A coordenação pode chamar pelo sistema; o pg_cron chama todo dia.
create or replace function public.purge_route_points(p_days integer default 30)
returns integer
language plpgsql security definer set search_path = public
as $$
declare n integer;
begin
  if auth.uid() is not null and not public.is_coord() then raise exception 'Sem permissão'; end if;
  if p_days is null or p_days < 1 then raise exception 'Dias inválidos'; end if;
  delete from public.route_points where at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_route_points(integer) from public, anon;
grant execute on function public.purge_route_points(integer) to authenticated;

-- Limpeza automática diária (03:30 de Brasília = 06:30 UTC), se o Supabase tiver pg_cron.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'limpar-pontos-rota';
  perform cron.schedule('limpar-pontos-rota', '30 6 * * *', 'select public.purge_route_points(30)');
exception when others then
  raise notice 'pg_cron indisponível (%). Use o botão "Apagar pontos antigos" na aba Mapa.', sqlerrm;
end $$;
