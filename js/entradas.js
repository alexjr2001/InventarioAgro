// ============================================================
// ENTRADAS - registro de ingresos de insumos, lista de
// ultimas entradas y alerta de vencimientos.
// ============================================================

configurarAutocompletado("en-producto", "en-nombre-generico", "en-producto-id",
  "en-sugerencias", "en-sugerencias-generico", (p) => {
  // la unidad del producto queda como valor por defecto, editable
  fijarUnidad($("en-unidad"), p.unidad);
});

$("en-producto").addEventListener("input", () => {
  const nombre = $("en-producto").value.trim().toUpperCase();
  const prod = productos.find((p) => p.nombre.toUpperCase() === nombre);
  if (prod) fijarUnidad($("en-unidad"), prod.unidad);
});

// Costo total = cantidad x costo unitario (editable)
function calcularCostoTotal() {
  const cant = Number($("en-cantidad").value);
  const cu = Number($("en-costo-unitario").value);
  if (cant > 0 && cu > 0) $("en-costo-total").value = (cant * cu).toFixed(2);
}
$("en-cantidad").addEventListener("input", calcularCostoTotal);
$("en-costo-unitario").addEventListener("input", calcularCostoTotal);

// ---------- Registrar entrada ----------

$("form-entrada").addEventListener("submit", (e) => {
  e.preventDefault();
  conBloqueo(e.target, async () => {
    const nombre = $("en-producto").value.trim().toUpperCase();
    if (!nombre) { aviso("Escribe el nombre comercial", true); return; }
    let prod = productoSeleccionado("en-producto-id");
    let productoNuevo = false;

    if (!prod) {
      prod = productos.find((p) => p.nombre.toUpperCase() === nombre) || null;
    }

    const generico = $("en-nombre-generico").value.trim().toUpperCase();
    if (prod && generico && generico !== (prod.nombre_generico || "").trim().toUpperCase()) {
      aviso("El nombre genérico no coincide con el producto. Para modificarlo, edita el insumo en Inventario.", true);
      return;
    }

    if (!prod) {
      const { data, error: errorProducto } = await db.from("productos").insert({
        nombre,
        nombre_generico: generico || null,
        unidad: $("en-unidad").value,
        stock_inicial: 0,
        stock_actual: 0,
      }).select("*").single();
      if (errorProducto) {
        if (errorProducto.code === "23505") {
          aviso("Ya existe un insumo con ese nombre comercial. Selecciónalo de la lista.", true);
          await cargarProductos();
          return;
        } else {
          aviso("Error creando insumo: " + errorProducto.message, true);
          return;
        }
      } else {
        prod = data;
        productoNuevo = true;
      }
    }

    const { error } = await db.from("entradas").insert({
      producto_id: prod.id,
      fecha: $("en-fecha").value,
      proveedor: $("en-proveedor").value.trim() || null,
      cantidad: Number($("en-cantidad").value),
      unidad: $("en-unidad").value.trim() || prod.unidad,
      costo_unitario: $("en-costo-unitario").value === "" ? null : Number($("en-costo-unitario").value),
      costo_total: $("en-costo-total").value === "" ? null : Number($("en-costo-total").value),
      factura: $("en-factura").value.trim() || null,
      comprado: $("en-comprado").checked,
      vencimiento: $("en-vencimiento").value || null,
    });
    if (error) {
      aviso(productoNuevo
        ? `El insumo se creó, pero no se registró la entrada: ${error.message}. Puedes volver a intentarlo.`
        : "Error registrando entrada: " + error.message, true);
      return;
    }
    aviso("Entrada registrada ✓");
    e.target.reset();
    $("en-producto-id").value = "";
    $("en-fecha").value = hoy();
    await Promise.all([cargarProductos(), cargarEntradas(), cargarVencimientos()]);
  });
});

// ---------- Lista de ultimas entradas ----------

let versionEntradas = 0;
const filtroEntradas = configurarFiltros({
  campos: [
    { id: "filtro-en-nombre", etiqueta: "Nombre comercial" },
    { id: "filtro-en-fecha", etiqueta: "Fecha", fecha: true },
  ],
  cargar: cargarEntradas,
  boton: "btn-filtro-entradas",
  panel: "panel-filtro-entradas",
  aviso: "aviso-filtro-entradas",
});

async function cargarEntradas() {
  const version = ++versionEntradas;
  const resultado = await consultarMovimientos("entradas", [
    { campo: "productos.nombre", valor: filtroEntradas("filtro-en-nombre") },
    { campo: "fecha", valor: filtroEntradas("filtro-en-fecha"), fecha: true },
  ], () => version === versionEntradas);
  if (!resultado) return;
  const { data, error } = resultado;
  if (error) {
    $("tbody-entradas").innerHTML = '<tr><td colspan="11">No se pudieron cargar las entradas</td></tr>';
    aviso("Error cargando entradas: " + error.message, true);
    return;
  }
  $("tbody-entradas").innerHTML = data.map((e) => `<tr>
      <td>${fmtFecha(e.fecha)}</td>
      <td>${escapeHtml(e.productos?.nombre)}</td>
      <td>${escapeHtml(e.proveedor)}</td>
      <td class="num">${fmtNum(e.cantidad)}</td>
      <td>${escapeHtml(e.unidad)}</td>
      <td class="num">${fmtNum(e.costo_unitario)}</td>
      <td class="num">${fmtNum(e.costo_total)}</td>
      <td>${escapeHtml(e.factura)}</td>
      <td>${e.comprado === null || e.comprado === undefined ? "Sin registrar" : e.comprado ? "Sí" : "No"}</td>
      <td>${fmtFecha(e.vencimiento)}</td>
      <td><button class="btn-borrar" data-borrar-entrada="${e.id}" title="Eliminar (revierte el stock)">🗑️</button></td>
    </tr>`).join("") || '<tr><td colspan="11">Sin entradas para mostrar</td></tr>';
}

$("tbody-entradas").addEventListener("click", async (e) => {
  const id = e.target.dataset.borrarEntrada;
  if (!id) return;
  if (!confirm("¿Eliminar esta entrada? El stock se revertirá.")) return;
  const { error } = await db.from("entradas").delete().eq("id", id);
  if (error) { aviso("Error: " + error.message, true); return; }
  aviso("Entrada eliminada");
  await Promise.all([cargarProductos(), cargarEntradas(), cargarVencimientos()]);
});

// ---------- Vencimientos (vencidos o por vencer en 30 dias) ----------

async function cargarVencimientos() {
  const limite = new Date();
  limite.setDate(limite.getDate() + 30);
  const fechaLimite = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`;
  const { data, error } = await db.from("entradas")
    .select("vencimiento, productos(nombre)")
    .not("vencimiento", "is", null)
    .lte("vencimiento", fechaLimite)
    .order("vencimiento");
  const banner = $("alerta-vencimiento");
  if (error || !data || data.length === 0) { banner.classList.add("oculto"); return; }
  const hoyStr = hoy();
  banner.innerHTML =
    `🕒 VENCIMIENTOS — ${data.length} lote(s) vencidos o por vencer en 30 días:<ul>` +
    data.map((e) => {
      const vencido = e.vencimiento < hoyStr;
      return `<li>${escapeHtml(e.productos?.nombre)}: ${vencido ? "<strong>VENCIDO</strong> desde el" : "vence el"} ${fmtFecha(e.vencimiento)}</li>`;
    }).join("") + "</ul>";
  banner.classList.remove("oculto");
}
