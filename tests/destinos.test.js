const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const destinosPermitidos = [
  "Uva red 136.1",
  "Uva Verde 136.2",
  "Uva red 136.3",
  "Uva red 136.4",
  "Granado 136.2",
  "Uva 140",
  "Granado 140",
  "Tomate 140",
];

function crearEntorno() {
  const elementos = {};
  const eventos = {};
  for (const id of ["sa-destino", "sa-destinos", "form-salida", "tbody-salidas",
    "sa-cantidad", "sa-responsable", "sa-fecha", "sa-producto-id", "sa-disponible"]) {
    elementos[id] = {
      value: "",
      addEventListener: (evento, fn) => { eventos[`${id}:${evento}`] = fn; },
      setCustomValidity(mensaje) { this.errorValidacion = mensaje; },
      reportValidity() { this.mostroError = true; },
    };
  }
  elementos["sa-destinos"].options = destinosPermitidos.map((value) => ({ value }));
  elementos["form-salida"].reset = () => { elementos["sa-destino"].value = ""; };
  elementos["sa-cantidad"].value = "1";
  elementos["sa-fecha"].value = "2026-11-23";
  const salidas = [];
  let pendiente;
  const contexto = {
    $: (id) => elementos[id],
    configurarAutocompletado() {},
    configurarFiltros() { return () => ""; },
    productoSeleccionado: () => ({ id: 1, stock_actual: 10, unidad: "KG" }),
    conBloqueo: (_, fn) => { pendiente = fn(); },
    aviso() {},
    hoy: () => "2026-11-23",
    cargarProductos: async () => {},
    db: {
      from: () => ({
        insert: async (salida) => {
          salidas.push(salida);
          return { error: null };
        },
      }),
    },
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "salidas.js"), "utf8"), contexto);
  contexto.cargarSalidas = async () => {};
  return {
    elementos,
    eventos,
    salidas,
    escribirDestino: (valor) => {
      elementos["sa-destino"].value = valor;
      eventos["sa-destino:input"]({ target: elementos["sa-destino"] });
    },
    guardar: async () => {
      eventos["form-salida:submit"]({ preventDefault() {}, target: elementos["form-salida"] });
      await pendiente;
    },
  };
}

test("muestra solo las ocho opciones de destino y permite buscarlas con datalist", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const campo = html.match(/<label>Cultivo o zona destino\s*([\s\S]*?)<\/label>/);

  assert.ok(campo, "debe existir el campo de destino");
  assert.match(campo[1], /<input type="search" id="sa-destino" list="sa-destinos" placeholder="Selecciona el destino"/);
  assert.doesNotMatch(campo[1], /Escribe «Uva» para ver todos los destinos de uva/);
  assert.deepEqual(
    [...campo[1].matchAll(/<option value="([^"]+)">/g)].map(([, value]) => value),
    destinosPermitidos,
  );
});

test("acepta el destino seleccionado y guarda su formato oficial", async () => {
  const entorno = crearEntorno();
  entorno.escribirDestino("uVa 140");
  await entorno.guardar();

  assert.equal(entorno.salidas[0].destino, "Uva 140");
});

test("rechaza un destino escrito que no esté en la lista", async () => {
  const entorno = crearEntorno();
  entorno.escribirDestino("Uva");
  await entorno.guardar();

  assert.equal(entorno.salidas.length, 0);
  assert.equal(entorno.elementos["sa-destino"].errorValidacion, "Elige un destino de la lista.");
  assert.equal(entorno.elementos["sa-destino"].mostroError, true);
});

test("permite dejar el destino vacío", async () => {
  const entorno = crearEntorno();
  await entorno.guardar();

  assert.equal(entorno.salidas[0].destino, null);
});
