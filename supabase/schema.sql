-- ============================================================
-- INVENTARIO DE AGROINSUMOS - Esquema de base de datos
-- Ejecutar en Supabase: SQL Editor > New query > pegar > Run
-- Despues ejecutar seed.sql para precargar los productos.
-- ============================================================

-- ---------- TABLAS ----------

create table if not exists productos (
  id             bigint generated always as identity primary key,
  nombre         text not null unique,
  unidad         text not null default 'UNIDAD',
  stock_inicial  numeric not null default 0,
  stock_actual   numeric not null default 0,
  stock_minimo   numeric,
  created_at     timestamptz not null default now()
);

create table if not exists entradas (
  id             bigint generated always as identity primary key,
  producto_id    bigint not null references productos(id) on delete cascade,
  fecha          date not null default current_date,
  proveedor      text,
  cantidad       numeric not null check (cantidad > 0),
  unidad         text,
  costo_unitario numeric,
  costo_total    numeric,
  factura        text,
  vencimiento    date,
  created_at     timestamptz not null default now()
);

create table if not exists salidas (
  id           bigint generated always as identity primary key,
  producto_id  bigint not null references productos(id) on delete cascade,
  fecha        date not null default current_date,
  cantidad     numeric not null check (cantidad > 0),
  responsable  text,
  destino      text,
  created_at   timestamptz not null default now()
);

-- ---------- TRIGGERS: mantienen stock_actual al dia ----------

create or replace function fn_aplicar_entrada() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update productos set stock_actual = stock_actual + new.cantidad
    where id = new.producto_id;
    return new;
  else -- DELETE: revierte la entrada
    update productos set stock_actual = stock_actual - old.cantidad
    where id = old.producto_id;
    return old;
  end if;
end $$;

create or replace function fn_aplicar_salida() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update productos set stock_actual = stock_actual - new.cantidad
    where id = new.producto_id;
    return new;
  else -- DELETE: revierte la salida
    update productos set stock_actual = stock_actual + old.cantidad
    where id = old.producto_id;
    return old;
  end if;
end $$;

drop trigger if exists trg_entradas on entradas;
create trigger trg_entradas
  after insert or delete on entradas
  for each row execute function fn_aplicar_entrada();

drop trigger if exists trg_salidas on salidas;
create trigger trg_salidas
  after insert or delete on salidas
  for each row execute function fn_aplicar_salida();

-- ---------- SEGURIDAD (RLS) ----------
-- Acceso abierto con la clave anon (publica), sin login.
-- Si mas adelante se requiere autenticacion, cambiar las
-- politicas a "to authenticated".

alter table productos enable row level security;
alter table entradas  enable row level security;
alter table salidas   enable row level security;

drop policy if exists "acceso_total_productos" on productos;
create policy "acceso_total_productos" on productos
  for all using (true) with check (true);

drop policy if exists "acceso_total_entradas" on entradas;
create policy "acceso_total_entradas" on entradas
  for all using (true) with check (true);

drop policy if exists "acceso_total_salidas" on salidas;
create policy "acceso_total_salidas" on salidas
  for all using (true) with check (true);
