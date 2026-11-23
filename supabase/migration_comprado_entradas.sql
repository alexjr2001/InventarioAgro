-- Las entradas anteriores conservan el estado desconocido.
alter table public.entradas add column if not exists comprado boolean;
alter table public.entradas alter column comprado set default true;
