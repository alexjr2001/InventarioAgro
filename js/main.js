// ============================================================
// MAIN - arranque de la aplicacion.
// Se carga al final, cuando todos los modulos ya existen.
// ============================================================

(function init() {
  $("en-fecha").value = hoy();
  $("sa-fecha").value = hoy();
  cargarTodo();
})();
