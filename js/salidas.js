// ============================================================
// SALIDAS - registro de uso/consumo de insumos y lista de
// ultimas salidas.
// ============================================================

configurarAutocompletado("sa-producto", "sa-producto-id", "sa-sugerencias", (p) => {
  $("sa-disponible").textContent = `(disponible: ${fmtNum(p.stock_actual)} ${p.unidad})`;
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
    const { error } = await db.from("salidas").insert({
      producto_id: prod.id,
      fecha: $("sa-fecha").value,
      cantidad,
      responsable: $("sa-responsable").value.trim() || null,
      destino: $("sa-destino").value.trim() || null,
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

async function cargarSalidas() {
  const { data, error } = await db.from("salidas")
    .select("*, productos(nombre)")
    .order("fecha", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (error) { aviso("Error cargando salidas: " + error.message, true); return; }
  $("tbody-salidas").innerHTML = data.map((s) => `<tr>
      <td>${fmtFecha(s.fecha)}</td>
      <td>${escapeHtml(s.productos?.nombre)}</td>
      <td class="num">${fmtNum(s.cantidad)}</td>
      <td>${escapeHtml(s.responsable)}</td>
      <td>${escapeHtml(s.destino)}</td>
      <td><button class="btn-borrar" data-borrar-salida="${s.id}" title="Eliminar (devuelve el stock)">🗑️</button></td>
    </tr>`).join("") || '<tr><td colspan="6">Sin salidas registradas</td></tr>';
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
