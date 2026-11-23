# 🌱 Inventario de Agroinsumos — AGROGRALEX EIRL

Inventario web para insumos agrícolas con **entradas**, **salidas**,
**alerta de stock mínimo** y **alerta de vencimientos**.
Frontend estático (desplegable en Vercel) + **Supabase** como base de datos.

## Estructura

| Archivo | Qué es |
|---|---|
| `index.html` / `styles.css` | Estructura y estilos de la página |
| `config.js` | **Aquí van tus claves de Supabase** |
| `js/comun.js` | Conexión a Supabase, utilidades, autocompletado, pestañas |
| `js/inventario.js` | Tabla de insumos, búsqueda, alertas de stock, crear/editar/eliminar |
| `js/entradas.js` | Registro de entradas, lista y alerta de vencimientos |
| `js/salidas.js` | Registro de salidas y lista |
| `js/main.js` | Arranque de la aplicación |
| `supabase/schema.sql` | Crea las tablas, triggers de stock y permisos |
| `supabase/seed.sql` | Precarga los 133 insumos del Excel |
| `supabase/acceso_abierto.sql` | Reabre el acceso si antes se activaron políticas con login |

> Los scripts se cargan en orden en `index.html`: primero `config.js` y
> `js/comun.js` (lo compartido), luego cada módulo, y al final `js/main.js`
> que arranca la app. Para añadir una nueva sección, crea otro archivo en
> `js/` y agrégalo antes de `main.js`.

## Paso 1 — Crear la base de datos en Supabase

1. Entra a [supabase.com](https://supabase.com) → **New project** (gratis).
2. En el menú lateral abre **SQL Editor** → **New query**.
3. Copia **todo** el contenido de `supabase/schema.sql`, pégalo y presiona **Run**.
   Esto crea las tablas `productos`, `entradas` y `salidas`, más los triggers
   que mantienen el stock actualizado automáticamente.
4. Repite con `supabase/seed.sql` para precargar los 133 productos del Excel
   (con su stock actual como stock inicial).

## Paso 2 — Poner las claves

1. En Supabase: **Project Settings** (engranaje) → **API**.
2. Copia:
   - **Project URL** → ej. `https://abcdefgh.supabase.co`
   - **anon public** key (la clave larga que empieza con `eyJ...`)
3. Abre `config.js` y reemplaza:

```js
const SUPABASE_URL = "https://abcdefgh.supabase.co";   // tu Project URL
const SUPABASE_ANON_KEY = "eyJ...";                    // tu anon public key
```

> ✅ La clave **anon** está diseñada para usarse en el navegador; es seguro
> publicarla. ❌ **Nunca** uses la clave `service_role` en `config.js`.

## Paso 3 — Probar en tu PC

Abre `index.html` con doble clic. Si las claves son correctas verás el
inventario precargado.

## Paso 4 — Desplegar en Vercel

**Opción fácil (sin terminal):**
1. Sube esta carpeta a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com): **Add New → Project** → importa el repo.
3. Framework Preset: **Other**. No necesita build. → **Deploy**.

**Opción CLI:**
```bash
npm i -g vercel
vercel          # desde esta carpeta
```

## Cómo funciona

- **Inventario**: lista con nombre, unidad, stock inicial / actual / mínimo.
  El stock mínimo se edita directo en la tabla. Con ✏️ puedes **editar**
  nombre, unidad, corregir el stock actual o **eliminar** el insumo.
- **⚠ Alerta roja arriba**: aparece cuando algún insumo tiene
  `stock actual ≤ stock mínimo` (solo si tiene mínimo definido).
- **🕒 Alerta amarilla**: lotes **vencidos o por vencer en 30 días** según
  la fecha de vencimiento registrada en las entradas.
- **Entradas**: escribe las primeras letras del insumo y aparecen sugerencias
  en tiempo real. Registra proveedor, cantidad, unidad (se llena sola),
  costo unitario, costo total (se calcula solo, editable), factura/remisión,
  vencimiento y fecha (hoy por defecto, editable). Al guardar, el stock sube.
- **Salidas**: insumo (con sugerencias), cantidad (valida que haya stock),
  responsable/operario y cultivo o zona destino. Al guardar, el stock baja.
- El 🗑️ en entradas/salidas elimina el registro y **revierte** el stock
  (para corregir errores).

## Nota de seguridad

Por decisión del equipo, la app funciona **sin inicio de sesión**: cualquiera
con la URL puede leer y escribir. La clave `anon/publishable` de `config.js`
es pública por diseño; **nunca** pongas ahí la `service_role`.
Cuando se necesite, se puede activar **Supabase Auth** (usuarios con
contraseña) y restringir las políticas RLS a `to authenticated`.
