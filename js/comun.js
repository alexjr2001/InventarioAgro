// ============================================================
// COMUN - conexion a Supabase, utilidades compartidas,
// autocompletado y navegacion por pestañas.
// Este archivo debe cargarse ANTES que los demas modulos.
// ============================================================

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let productos = []; // cache local para busqueda y autocompletado

// ---------- Utilidades ----------

const $ = (id) => document.getElementById(id);

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtNum(n) {
  if (n === null || n === undefined) return "";
  return Number(n).toLocaleString("es-PE", { maximumFractionDigits: 3 });
}

function fmtFecha(f) {
  if (!f) return "";
  const [y, m, d] = f.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let avisoTimer;
function aviso(msg, esError = false) {
  const el = $("aviso");
  el.textContent = msg;
  el.classList.toggle("error", esError);
  el.classList.remove("oculto");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.add("oculto"), 3500);
}

function enMinimo(p) {
  return p.stock_minimo !== null && Number(p.stock_actual) <= Number(p.stock_minimo);
}

// Evita el doble envio de formularios (doble clic)
async function conBloqueo(formulario, fn) {
  const btn = formulario.querySelector('button[type="submit"]');
  if (btn.disabled) return;
  btn.disabled = true;
  try { await fn(); } finally { btn.disabled = false; }
}

// Recarga todos los datos (funciones definidas en cada modulo)
async function cargarTodo() {
  await Promise.all([cargarProductos(), cargarEntradas(), cargarSalidas(), cargarVencimientos()]);
}

// ---------- Pestañas ----------

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("activa"));
    btn.classList.add("activa");
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("oculto"));
    $("tab-" + btn.dataset.tab).classList.remove("oculto");
  });
});

// ---------- Autocompletado (busqueda en tiempo real) ----------

function configurarAutocompletado(inputId, hiddenId, listaId, alElegir) {
  const input = $(inputId);
  const hidden = $(hiddenId);
  const lista = $(listaId);
  let indice = -1;

  function cerrar() {
    lista.classList.add("oculto");
    lista.innerHTML = "";
    indice = -1;
  }

  function elegir(p) {
    input.value = p.nombre;
    hidden.value = p.id;
    cerrar();
    if (alElegir) alElegir(p);
  }

  input.addEventListener("input", () => {
    hidden.value = ""; // el texto cambio: ya no hay producto confirmado
    const q = input.value.trim().toUpperCase();
    if (!q) { cerrar(); return; }
    const coincidencias = productos
      .filter((p) => p.nombre.toUpperCase().includes(q))
      .sort((a, b) => {
        // primero los que EMPIEZAN con lo escrito
        const ea = a.nombre.toUpperCase().startsWith(q) ? 0 : 1;
        const eb = b.nombre.toUpperCase().startsWith(q) ? 0 : 1;
        return ea - eb || a.nombre.localeCompare(b.nombre);
      })
      .slice(0, 8);
    if (coincidencias.length === 0) { cerrar(); return; }
    lista.innerHTML = coincidencias.map((p, i) =>
      `<li data-i="${i}">${escapeHtml(p.nombre)}
         <span class="detalle">${fmtNum(p.stock_actual)} ${escapeHtml(p.unidad)}</span></li>`
    ).join("");
    lista.classList.remove("oculto");
    indice = -1;
    lista.querySelectorAll("li").forEach((li, i) =>
      li.addEventListener("mousedown", (ev) => { ev.preventDefault(); elegir(coincidencias[i]); }));
    lista._coincidencias = coincidencias;
  });

  input.addEventListener("keydown", (e) => {
    const items = lista.querySelectorAll("li");
    if (lista.classList.contains("oculto") || items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); indice = Math.min(indice + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); indice = Math.max(indice - 1, 0); }
    else if (e.key === "Enter") {
      if (indice >= 0) { e.preventDefault(); elegir(lista._coincidencias[indice]); }
      return;
    } else if (e.key === "Escape") { cerrar(); return; }
    else return;
    items.forEach((li, i) => li.classList.toggle("resaltada", i === indice));
  });

  input.addEventListener("blur", () => setTimeout(cerrar, 150));
}

function productoSeleccionado(hiddenId) {
  const id = $(hiddenId).value;
  return productos.find((p) => String(p.id) === id) || null;
}

// Selecciona una unidad en un <select>; si no existe como opcion
// (unidades antiguas sin normalizar), la agrega para no perderla.
function fijarUnidad(select, valor) {
  if (!valor) return;
  if (![...select.options].some((o) => o.value === valor)) {
    const op = document.createElement("option");
    op.value = op.textContent = valor;
    select.appendChild(op);
  }
  select.value = valor;
}
