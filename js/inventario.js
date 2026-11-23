// ============================================================
// INVENTARIO - tabla de insumos, busqueda, alerta de stock
// minimo, crear / editar / eliminar insumos.
// ============================================================

// ---------- Carga de productos + banner de alerta ----------

async function cargarProductos() {
  const { data, error } = await db.from("productos").select("*").order("nombre");
  if (error) { aviso("Error cargando productos: " + error.message, true); return; }
  productos = data;
  renderInventario();
  renderAlerta();
}

function renderAlerta() {
  const bajos = productos.filter(enMinimo);
  const banner = $("alerta-stock");
  if (bajos.length === 0) { banner.classList.add("oculto"); return; }
  banner.innerHTML =
    `⚠️ ADVERTENCIA — ${bajos.length} insumo(s) en stock mínimo:<ul>` +
    bajos.map((p) =>
      `<li>${escapeHtml(p.nombre)}: quedan ${fmtNum(p.stock_actual)} ${escapeHtml(p.unidad)} (mínimo ${fmtNum(p.stock_minimo)})</li>`
    ).join("") + "</ul>";
  banner.classList.remove("oculto");
}

// ---------- Tabla ----------

function renderInventario() {
  const filtro = $("buscar-inventario").value.trim().toUpperCase();
  const filas = productos
    .filter((p) => !filtro || p.nombre.toUpperCase().includes(filtro))
    .map((p) => {
      const min = enMinimo(p);
      const badge = p.stock_minimo === null
        ? '<span class="badge sin-minimo">sin mínimo</span>'
        : min
          ? '<span class="badge minimo">⚠ EN MÍNIMO</span>'
          : '<span class="badge ok">OK</span>';
      return `<tr class="${min ? "fila-minimo" : ""}">
        <td>${escapeHtml(p.nombre)}</td>
        <td>${escapeHtml(p.unidad)}</td>
        <td class="num">${fmtNum(p.stock_inicial)}</td>
        <td class="num"><strong>${fmtNum(p.stock_actual)}</strong></td>
        <td class="num">
          <input type="number" step="any" min="0" value="${p.stock_minimo ?? ""}"
                 style="width:80px" data-minimo="${p.id}" placeholder="—">
        </td>
        <td>${badge}</td>
        <td><button class="btn-borrar" data-editar="${p.id}" title="Editar insumo">✏️</button></td>
      </tr>`;
    });
  $("tbody-inventario").innerHTML =
    filas.join("") || '<tr><td colspan="7">Sin resultados</td></tr>';
}

$("buscar-inventario").addEventListener("input", renderInventario);

// Editar stock minimo directamente en la tabla
$("tbody-inventario").addEventListener("change", async (e) => {
  const id = e.target.dataset.minimo;
  if (!id) return;
  const valor = e.target.value === "" ? null : Number(e.target.value);
  const { error } = await db.from("productos").update({ stock_minimo: valor }).eq("id", id);
  if (error) { aviso("Error guardando mínimo: " + error.message, true); return; }
  aviso("Stock mínimo actualizado");
  await cargarProductos();
});

// ---------- Accesos rapidos y nuevo producto ----------

$("btn-ir-entrada").addEventListener("click", () => {
  irAPestana("entradas");
  $("en-producto").focus();
});

$("btn-ir-salida").addEventListener("click", () => {
  irAPestana("salidas");
  $("sa-producto").focus();
});

$("btn-nuevo-producto").addEventListener("click", () =>
  $("form-producto").classList.toggle("oculto"));
$("np-cancelar").addEventListener("click", () =>
  $("form-producto").classList.add("oculto"));

$("form-producto").addEventListener("submit", (e) => {
  e.preventDefault();
  conBloqueo(e.target, async () => {
    const stock = Number($("np-stock").value);
    const { error } = await db.from("productos").insert({
      nombre: $("np-nombre").value.trim().toUpperCase(),
      unidad: $("np-unidad").value.trim().toUpperCase(),
      stock_inicial: stock,
      stock_actual: stock,
      stock_minimo: $("np-minimo").value === "" ? null : Number($("np-minimo").value),
    });
    if (error) {
      aviso(error.code === "23505" ? "Ya existe un insumo con ese nombre" : "Error: " + error.message, true);
      return;
    }
    aviso("Insumo creado");
    e.target.reset();
    $("form-producto").classList.add("oculto");
    await cargarProductos();
  });
});

// ---------- Editar / eliminar insumo ----------

$("tbody-inventario").addEventListener("click", (e) => {
  const id = e.target.dataset.editar;
  if (!id) return;
  const p = productos.find((x) => String(x.id) === id);
  if (!p) return;
  $("ed-id").value = p.id;
  $("ed-titulo").textContent = p.nombre;
  $("ed-nombre").value = p.nombre;
  fijarUnidad($("ed-unidad"), p.unidad);
  $("ed-stock").value = p.stock_actual;
  $("ed-minimo").value = p.stock_minimo ?? "";
  $("form-producto").classList.add("oculto");
  $("form-editar").classList.remove("oculto");
  $("form-editar").scrollIntoView({ behavior: "smooth", block: "center" });
});

$("ed-cancelar").addEventListener("click", () => $("form-editar").classList.add("oculto"));

$("form-editar").addEventListener("submit", (e) => {
  e.preventDefault();
  conBloqueo(e.target, async () => {
    const { error } = await db.from("productos").update({
      nombre: $("ed-nombre").value.trim().toUpperCase(),
      unidad: $("ed-unidad").value.trim().toUpperCase(),
      stock_actual: Number($("ed-stock").value),
      stock_minimo: $("ed-minimo").value === "" ? null : Number($("ed-minimo").value),
    }).eq("id", $("ed-id").value);
    if (error) {
      aviso(error.code === "23505" ? "Ya existe un insumo con ese nombre" : "Error: " + error.message, true);
      return;
    }
    aviso("Insumo actualizado");
    $("form-editar").classList.add("oculto");
    await cargarProductos();
  });
});

$("ed-eliminar").addEventListener("click", async () => {
  const id = $("ed-id").value;
  const p = productos.find((x) => String(x.id) === id);
  if (!confirm(`¿Eliminar "${p?.nombre}" y TODO su historial de entradas y salidas?\nEsta acción no se puede deshacer.`)) return;
  const { error } = await db.from("productos").delete().eq("id", id);
  if (error) { aviso("Error eliminando: " + error.message, true); return; }
  aviso("Insumo eliminado");
  $("form-editar").classList.add("oculto");
  await cargarTodo();
});
