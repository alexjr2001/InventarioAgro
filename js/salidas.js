// ============================================================
// SALIDAS - registro de uso/consumo de insumos y lista de
// ultimas salidas.
// ============================================================

configurarAutocompletado("sa-producto", "sa-nombre-generico", "sa-producto-id",
  "sa-sugerencias", "sa-sugerencias-generico", (p) => {
  $("sa-disponible").textContent = `(disponible: ${fmtNum(p.stock_actual)} ${p.unidad})`;
}, () => { $("sa-disponible").textContent = ""; });

function buscarDestino(valor) {
  const normalizado = valor.trim().toLocaleLowerCase();
  return Array.from($("sa-destinos").options)
    .find((opcion) => opcion.value.toLocaleLowerCase() === normalizado);
}

$("sa-destino").addEventListener("input", (e) => {
  const destino = e.target.value.trim();
  e.target.setCustomValidity(destino && !buscarDestino(destino)
    ? "Elige un destino de la lista."
    : "");
});

// ---------- Registrar salida ----------

$("form-salida").addEventListener("submit", (e) => {
  e.preventDefault();
  conBloqueo(e.target, async () => {
    const prod = productoSeleccionado("sa-producto-id");
    if (!prod) { aviso("Elige un insumo de la lista de sugerencias", true); return; }
    const cantidad = Number($("sa-cantidad").value);
    if (cantidad > Number(prod.stock_actual)) {
      aviso(`No hay stock suficiente: quedan ${fmtNum(prod.stock_actual)} ${prod.unidad}`, true);
      return;
    }
    const campoDestino = $("sa-destino");
    const destinoIngresado = campoDestino.value.trim();
    const destinoSeleccionado = buscarDestino(destinoIngresado);
    if (destinoIngresado && !destinoSeleccionado) {
      campoDestino.setCustomValidity("Elige un destino de la lista.");
      campoDestino.reportValidity();
      return;
    }
    campoDestino.setCustomValidity("");
    const { error } = await db.from("salidas").insert({
      producto_id: prod.id,
      fecha: $("sa-fecha").value,
      cantidad,
      responsable: $("sa-responsable").value.trim() || null,
      destino: destinoSeleccionado ? destinoSeleccionado.value : null,
    });
    if (error) { aviso("Error registrando salida: " + error.message, true); return; }
    aviso("Salida registrada ✓");
    e.target.reset();
    $("sa-producto-id").value = "";
    $("sa-disponible").textContent = "";
    $("sa-fecha").value = hoy();
    await Promise.all([cargarProductos(), cargarSalidas()]);
  });
});

// ---------- Lista de ultimas salidas ----------

let versionSalidas = 0;
const filtroSalidas = configurarFiltros({
  campos: [
    { id: "filtro-sa-nombre", etiqueta: "Nombre comercial" },
    { id: "filtro-sa-responsable", etiqueta: "Responsable" },
    { id: "filtro-sa-fecha", etiqueta: "Fecha", fecha: true },
    { id: "filtro-sa-destino", etiqueta: "Destino" },
  ],
  cargar: cargarSalidas,
  boton: "btn-filtro-salidas",
  panel: "panel-filtro-salidas",
  aviso: "aviso-filtro-salidas",
});

async function cargarSalidas() {
  const version = ++versionSalidas;
  const resultado = await consultarMovimientos("salidas", [
    { campo: "productos.nombre", valor: filtroSalidas("filtro-sa-nombre") },
    { campo: "responsable", valor: filtroSalidas("filtro-sa-responsable") },
    { campo: "fecha", valor: filtroSalidas("filtro-sa-fecha"), fecha: true },
    { campo: "destino", valor: filtroSalidas("filtro-sa-destino") },
  ], () => version === versionSalidas);
  if (!resultado) return;
  const { data, error } = resultado;
  if (error) {
    $("tbody-salidas").innerHTML = '<tr><td colspan="6">No se pudieron cargar las salidas</td></tr>';
    aviso("Error cargando salidas: " + error.message, true);
    return;
  }
  $("tbody-salidas").innerHTML = data.map((s) => `<tr>
      <td>${fmtFecha(s.fecha)}</td>
      <td>${escapeHtml(s.productos?.nombre)}</td>
      <td class="num">${fmtNum(s.cantidad)}</td>
      <td>${escapeHtml(s.responsable)}</td>
      <td>${escapeHtml(s.destino)}</td>
      <td><button class="btn-borrar" data-borrar-salida="${s.id}" title="Eliminar (devuelve el stock)">🗑️</button></td>
    </tr>`).join("") || '<tr><td colspan="6">Sin salidas para mostrar</td></tr>';
}

$("tbody-salidas").addEventListener("click", async (e) => {
  const id = e.target.dataset.borrarSalida;
  if (!id) return;
  if (!confirm("¿Eliminar esta salida? El stock se devolverá.")) return;
  const { error } = await db.from("salidas").delete().eq("id", id);
  if (error) { aviso("Error: " + error.message, true); return; }
  aviso("Salida eliminada");
  await Promise.all([cargarProductos(), cargarSalidas()]);
});
