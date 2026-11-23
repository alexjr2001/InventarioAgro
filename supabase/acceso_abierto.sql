-- ============================================================
-- REABRIR EL ACCESO (sin login)
-- Ejecutar UNA VEZ en Supabase: SQL Editor > New query > Run
--
-- Quita las politicas que exigian sesion iniciada y deja las
-- tablas accesibles con la clave publica (anon).
-- ============================================================

-- Quita las politicas con autenticacion (si existen)
drop policy if exists "auth_productos" on productos;
drop policy if exists "auth_entradas" on entradas;
drop policy if exists "auth_salidas" on salidas;

-- Acceso abierto
drop policy if exists "acceso_total_productos" on productos;
create policy "acceso_total_productos" on productos
  for all using (true) with check (true);

drop policy if exists "acceso_total_entradas" on entradas;
create policy "acceso_total_entradas" on entradas
  for all using (true) with check (true);

drop policy if exists "acceso_total_salidas" on salidas;
create policy "acceso_total_salidas" on salidas
  for all using (true) with check (true);
