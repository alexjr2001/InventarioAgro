// ============================================================
// ENTRADAS - registro de ingresos de insumos, lista de
// ultimas entradas y alerta de vencimientos.
// ============================================================

configurarAutocompletado("en-producto", "en-producto-id", "en-sugerencias", (p) => {
  // la unidad del producto queda como valor por defecto, editable
  fijarUnidad($("en-unidad"), p.unidad);
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
    const prod = productoSeleccionado("en-producto-id");
    if (!prod) { aviso("Elige un insumo de la lista de sugerencias", true); return; }
    const { error } = await db.from("entradas").insert({
      producto_id: prod.id,
      fecha: $("en-fecha").value,
      proveedor: $("en-proveedor").value.trim() || null,
      cantidad: Number($("en-cantidad").value),
      unidad: $("en-unidad").value.trim() || prod.unidad,
      costo_unitario: $("en-costo-unitario").value === "" ? null : Number($("en-costo-unitario").value),
      costo_total: $("en-costo-total").value === "" ? null : Number($("en-costo-total").value),
      factura: $("en-factura").value.trim() || null,
      vencimiento: $("en-vencimiento").value || null,
    });
    if (error) { aviso("Error registrando entrada: " + error.message, true); return; }
    aviso("Entrada registrada ✓");
    e.target.reset();
    $("en-producto-id").value = "";
    $("en-fecha").value = hoy();
    await Promise.all([cargarProductos(), cargarEntradas(), cargarVencimientos()]);
  });
});

// ---------- Lista de ultimas entradas ----------

async function cargarEntradas() {
  const { data, error } = await db.from("entradas")
    .select("*, productos(nombre)")
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (error) { aviso("Error cargando entradas: " + error.message, true); return; }
  $("tbody-entradas").innerHTML = data.map((e) => `<tr>
      <td>${fmtFecha(e.fecha)}</td>
      <td>${escapeHtml(e.productos?.nombre)}</td>
      <td>${escapeHtml(e.proveedor)}</td>
      <td class="num">${fmtNum(e.cantidad)}</td>
      <td>${escapeHtml(e.unidad)}</td>
      <td class="num">${fmtNum(e.costo_unitario)}</td>
      <td class="num">${fmtNum(e.costo_total)}</td>
      <td>${escapeHtml(e.factura)}</td>
      <td>${fmtFecha(e.vencimiento)}</td>
      <td><button class="btn-borrar" data-borrar-entrada="${e.id}" title="Eliminar (revierte el stock)">🗑️</button></td>
    </tr>`).join("") || '<tr><td colspan="10">Sin entradas registradas</td></tr>';
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
