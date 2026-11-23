begin;

create table if not exists public.destinos (
  nombre text primary key
);

alter table public.destinos enable row level security;
drop policy if exists "acceso_total_destinos" on public.destinos;
create policy "acceso_total_destinos" on public.destinos
  for all using (true) with check (true);

create or replace function public.fn_guardar_destino() returns trigger
language plpgsql as $$
begin
  if nullif(btrim(new.destino), '') is not null then
    insert into public.destinos (nombre) values (upper(btrim(new.destino)))
    on conflict (nombre) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_guardar_destino on public.salidas;
create trigger trg_guardar_destino
  after insert on public.salidas
  for each row execute function public.fn_guardar_destino();

insert into public.destinos (nombre)
select distinct upper(btrim(destino)) from public.salidas
where nullif(btrim(destino), '') is not null
on conflict (nombre) do nothing;

commit;
