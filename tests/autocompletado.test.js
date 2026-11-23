const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "comun.js"), "utf8");
const autocomplete = source.slice(
  source.indexOf("function configurarAutocompletado("),
  source.indexOf("function productoSeleccionado(")
);

function crearEntorno() {
  const productos = [
    { id: 1, nombre: "MARCA A", nombre_generico: "GLIFOSATO", unidad: "LITROS", stock_actual: 4 },
    { id: 2, nombre: "MARCA B", nombre_generico: "GLIFOSATO", unidad: "KG", stock_actual: 2 },
    { id: 3, nombre: "OTRO", nombre_generico: null, unidad: "UNIDAD", stock_actual: 1 },
  ];
  const elementos = {};
  for (const id of ["comercial", "generico", "id", "lista", "lista-generico"]) {
    const listeners = {};
    const clases = new Set(["oculto"]);
    elementos[id] = {
      value: "",
      innerHTML: "",
      listeners,
      classList: {
        add: (clase) => clases.add(clase),
        remove: (clase) => clases.delete(clase),
        contains: (clase) => clases.has(clase),
        toggle: () => {},
      },
      addEventListener: (evento, fn) => { listeners[evento] = fn; },
      querySelectorAll: () => Array.from(
        elementos[id].innerHTML.matchAll(/<li data-i="\d+">/g),
        () => ({ addEventListener() {}, classList: { toggle() {} } })
      ),
    };
  }
  let seleccionado;
  let cambios = 0;
  const contexto = {
    productos,
    $: (id) => elementos[id],
    escapeHtml: (valor) => String(valor ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    fmtNum: String,
    setTimeout,
  };
  vm.createContext(contexto);
  vm.runInContext(autocomplete, contexto);
  contexto.configurarAutocompletado("comercial", "generico", "id", "lista", "lista-generico",
    (producto) => { seleccionado = producto; }, () => { cambios++; });
  return { elementos, productos, seleccionado: () => seleccionado, cambios: () => cambios };
}

for (const campo of ["comercial", "generico"]) {
  test(`busca ambos nombres desde ${campo} y completa ambos al seleccionar`, () => {
    const { elementos, seleccionado } = crearEntorno();
    const input = elementos[campo];
    const lista = elementos[campo === "comercial" ? "lista" : "lista-generico"];
    input.value = campo === "comercial" ? "glifosato" : "marca";
    input.listeners.input();
    assert.match(lista.innerHTML, /MARCA A \(GLIFOSATO\)/);
    assert.match(lista.innerHTML, /MARCA B \(GLIFOSATO\)/);
    input.listeners.keydown({ key: "ArrowDown", preventDefault() {} });
    input.listeners.keydown({ key: "Enter", preventDefault() {} });
    assert.equal(elementos.comercial.value, "MARCA A");
    assert.equal(elementos.generico.value, "GLIFOSATO");
    assert.equal(elementos.id.value, 1);
    assert.equal(seleccionado().id, 1);
  });
}

test("al cambiar un nombre seleccionado, limpia el otro y la selección", () => {
  const { elementos, cambios } = crearEntorno();
  elementos.comercial.value = "marca";
  elementos.comercial.listeners.input();
  elementos.comercial.listeners.keydown({ key: "ArrowDown", preventDefault() {} });
  elementos.comercial.listeners.keydown({ key: "Enter", preventDefault() {} });
  elementos.generico.value = "otro";
  elementos.generico.listeners.input();
  assert.equal(elementos.comercial.value, "");
  assert.equal(elementos.id.value, "");
  assert.match(elementos["lista-generico"].innerHTML, /OTRO \(Sin nombre genérico\)/);
  assert.equal(cambios(), 2);
});

test("muestra todos los productos que comparten un nombre genérico", () => {
  const { elementos, productos } = crearEntorno();
  for (let i = 4; i <= 12; i++) {
    productos.push({ id: i, nombre: `MARCA ${i}`, nombre_generico: "GLIFOSATO", unidad: "KG", stock_actual: 1 });
  }
  elementos.generico.value = "glifosato";
  elementos.generico.listeners.input();
  assert.equal((elementos["lista-generico"].innerHTML.match(/<li data-i=/g) || []).length, 11);
});
