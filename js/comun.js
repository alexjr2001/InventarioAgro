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

// Los filtros solo se aplican al pulsar "Aplicar filtros"; devuelve el valor aplicado de cada campo
function configurarFiltros({ campos, cargar, boton: botonId, panel: panelId, aviso: avisoId }) {
  const boton = $(botonId);
  const panel = $(panelId);
  const aviso = $(avisoId);
  let aplicados = {};

  const actualizarEstado = () => {
    const activos = campos.filter((c) => aplicados[c.id]);
    boton.textContent = activos.length ? `Filtrar (${activos.length})` : "Filtrar";
    aviso.classList.toggle("oculto", !activos.length);
    aviso.querySelector("span").textContent = "Filtrando por: " +
      activos.map((c) => `${c.etiqueta}: ${c.fecha ? fmtFecha(aplicados[c.id]) : aplicados[c.id]}`).join(" · ");
  };
  const aplicar = (valores) => {
    aplicados = valores;
    actualizarEstado();
    cargar();
  };

  boton.addEventListener("click", () => {
    const abrir = panel.classList.contains("oculto");
    panel.classList.toggle("oculto", !abrir);
    boton.setAttribute("aria-expanded", String(abrir));
    if (abrir) $(campos[0].id).focus();
  });
  panel.addEventListener("submit", (e) => {
    e.preventDefault();
    aplicar(Object.fromEntries(campos.map((c) => [c.id, $(c.id).value.trim()])));
  });
  [panel, aviso].forEach((contenedor) =>
    contenedor.querySelector(".quitar-filtros").addEventListener("click", () => {
      campos.forEach((c) => { $(c.id).value = ""; });
      aplicar({});
    }));

  return (id) => aplicados[id] || "";
}

async function consultarMovimientos(tabla, filtros, vigente) {
  const activos = filtros.filter((filtro) => filtro.valor);
  const resultados = [];
  const tamanoPagina = 1000;
  let inicio = 0;
  for (;;) {
    let consulta = db.from(tabla)
      .select("*, productos!inner(nombre)")
      .order("fecha", { ascending: false })
      .order("id", { ascending: false });
    for (const filtro of activos) {
      if (filtro.fecha) consulta = consulta.eq(filtro.campo, filtro.valor);
      else {
        const texto = filtro.valor.replace(/[\\%_*]/g, "\\$&");
        consulta = consulta.ilike(filtro.campo, `%${texto}%`);
      }
    }
    consulta = activos.length
      ? consulta.range(inicio, inicio + tamanoPagina - 1)
      : consulta.limit(50);
    const { data, error } = await consulta;
    if (!vigente()) return null;
    if (error) return { error };
    resultados.push(...data);
    if (!activos.length || data.length < tamanoPagina) return { data: resultados };
    inicio += tamanoPagina;
  }
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
  await Promise.all([cargarProductos(), cargarEntradas(), cargarSalidas(), cargarVencimientos(), cargarDestinos()]);
}

// ---------- Pestañas ----------

function irAPestana(nombre) {
  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("activa", b.dataset.tab === nombre));
  document.querySelectorAll(".panel").forEach((p) => p.classList.add("oculto"));
  $("tab-" + nombre).classList.remove("oculto");
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => irAPestana(btn.dataset.tab));
});

// ---------- Autocompletado (busqueda en tiempo real) ----------

function configurarAutocompletado(inputId, genericoId, hiddenId, listaId, listaGenericoId, alElegir, alCambiar) {
  const comercial = $(inputId);
  const generico = $(genericoId);
  const hidden = $(hiddenId);
  const listas = [$(listaId), $(listaGenericoId)];

  function elegir(p, cerrar) {
    comercial.value = p.nombre;
    generico.value = p.nombre_generico || "";
    hidden.value = p.id;
    cerrar();
    if (alElegir) alElegir(p);
  }

  [comercial, generico].forEach((input, posicion) => {
    const lista = listas[posicion];
    let indice = -1;
    let coincidencias = [];

    function cerrar() {
      lista.classList.add("oculto");
      lista.innerHTML = "";
      indice = -1;
    }

    input.addEventListener("input", () => {
      if (hidden.value) (posicion === 0 ? generico : comercial).value = "";
      hidden.value = "";
      if (alCambiar) alCambiar();
      const q = input.value.trim().toUpperCase();
      if (!q) { cerrar(); return; }
      coincidencias = productos
        .filter((p) => p.nombre.toUpperCase().includes(q) ||
          (p.nombre_generico || "").toUpperCase().includes(q))
        .sort((a, b) => {
          const empieza = (p) => p.nombre.toUpperCase().startsWith(q) ||
            (p.nombre_generico || "").toUpperCase().startsWith(q) ? 0 : 1;
          return empieza(a) - empieza(b) || a.nombre.localeCompare(b.nombre);
        });
      if (coincidencias.length === 0) { cerrar(); return; }
      lista.innerHTML = coincidencias.map((p, i) =>
        `<li data-i="${i}"><span>${escapeHtml(p.nombre)} (${escapeHtml(p.nombre_generico || "Sin nombre genérico")})</span>
           <span class="detalle">${fmtNum(p.stock_actual)} ${escapeHtml(p.unidad)}</span></li>`
      ).join("");
      lista.classList.remove("oculto");
      indice = -1;
      lista.querySelectorAll("li").forEach((li, i) =>
        li.addEventListener("mousedown", (ev) => { ev.preventDefault(); elegir(coincidencias[i], cerrar); }));
    });

    input.addEventListener("keydown", (e) => {
      const items = lista.querySelectorAll("li");
      if (lista.classList.contains("oculto") || items.length === 0) return;
      if (e.key === "ArrowDown") { e.preventDefault(); indice = Math.min(indice + 1, items.length - 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); indice = Math.max(indice - 1, 0); }
      else if (e.key === "Enter") {
        if (indice >= 0) { e.preventDefault(); elegir(coincidencias[indice], cerrar); }
        return;
      } else if (e.key === "Escape") { cerrar(); return; }
      else return;
      items.forEach((li, i) => li.classList.toggle("resaltada", i === indice));
    });

    input.addEventListener("blur", () => setTimeout(cerrar, 150));
  });
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
