const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function crearEntorno() {
  const elementos = {};
  const eventos = {};
  for (const id of ["sa-destino", "sa-destinos", "form-salida", "tbody-salidas",
    "sa-cantidad", "sa-responsable", "sa-fecha", "sa-producto-id", "sa-disponible"]) {
    elementos[id] = {
      value: "",
      addEventListener: (evento, fn) => { eventos[`${id}:${evento}`] = fn; },
    };
  }
  elementos["sa-destinos"].replaceChildren = (...opciones) => {
    elementos["sa-destinos"].opciones = opciones.map((opcion) => opcion.value);
  };
  elementos["form-salida"].reset = () => { elementos["sa-destino"].value = ""; };
  elementos["sa-cantidad"].value = "1";
  elementos["sa-fecha"].value = "2026-11-23";
  const destinos = new Set(["UVA 140"]);
  const salidas = [];
  const avisos = [];
  let pendiente;
  let errorSalida = null;
  let errorDestinos = null;
  const contexto = {
    $: (id) => elementos[id],
    configurarAutocompletado() {},
    configurarFiltros() { return () => ""; },
    productoSeleccionado: () => ({ id: 1, stock_actual: 10, unidad: "KG" }),
    conBloqueo: (_, fn) => { pendiente = fn(); },
    aviso: (mensaje, esError) => { avisos.push({ mensaje, esError }); },
    hoy: () => "2026-11-23",
    cargarProductos: async () => {},
    document: { createElement: () => ({ value: "" }) },
    db: {
      from: (tabla) => tabla === "destinos" ? {
        select: () => ({ order: () => ({
          range: async (inicio, fin) => ({
            data: errorDestinos ? null : [...destinos].sort().slice(inicio, fin + 1).map((nombre) => ({ nombre })),
            error: errorDestinos,
          }),
        }) }),
      } : {
        insert: async (salida) => {
          if (errorSalida) return { error: errorSalida };
          salidas.push(salida);
          if (salida.destino) destinos.add(salida.destino.trim().toUpperCase());
          return { error: null };
        },
      },
    },
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "salidas.js"), "utf8"), contexto);
  contexto.cargarSalidas = async () => {};
  return {
    elementos,
    eventos,
    destinos,
    salidas,
    avisos,
    cargar: () => contexto.cargarDestinos(),
    fallarSalida: () => { errorSalida = { message: "falló" }; },
    fallarDestinos: () => { errorDestinos = { message: "falló" }; },
    guardar: async () => {
      eventos["form-salida:submit"]({ preventDefault() {}, target: elementos["form-salida"] });
      await pendiente;
    },
  };
}

test("carga los destinos guardados al enfocar el campo", async () => {
  const entorno = crearEntorno();
  await entorno.eventos["sa-destino:focus"]();
  assert.deepEqual(entorno.elementos["sa-destinos"].opciones, ["UVA 140"]);
});

test("una salida puede registrar un destino nuevo, reutilizarlo o dejarlo vacío", async () => {
  const entorno = crearEntorno();
  entorno.elementos["sa-destino"].value = "  Palta 20  ";
  await entorno.guardar();
  assert.equal(entorno.salidas[0].destino, "Palta 20");
  assert.ok(entorno.elementos["sa-destinos"].opciones.includes("PALTA 20"));

  entorno.elementos["sa-destino"].value = "palta 20";
  await entorno.guardar();
  assert.equal(entorno.destinos.size, 2);

  entorno.elementos["sa-destino"].value = "   ";
  await entorno.guardar();
  assert.equal(entorno.salidas[2].destino, null);
  assert.equal(entorno.destinos.size, 2);
});

test("si falla la salida no se crea un destino", async () => {
  const entorno = crearEntorno();
  entorno.fallarSalida();
  entorno.elementos["sa-destino"].value = "NUEVO";
  await entorno.guardar();
  assert.equal(entorno.salidas.length, 0);
  assert.equal(entorno.destinos.has("NUEVO"), false);
  assert.equal(entorno.elementos["sa-destino"].value, "NUEVO");
});

test("carga más de una página de destinos", async () => {
  const entorno = crearEntorno();
  for (let i = 0; i < 1000; i++) entorno.destinos.add(`ZONA ${i}`);
  await entorno.cargar();
  assert.equal(entorno.elementos["sa-destinos"].opciones.length, 1001);
});

test("informa errores al cargar destinos y conserva las sugerencias anteriores", async () => {
  const entorno = crearEntorno();
  await entorno.cargar();
  entorno.fallarDestinos();
  await entorno.cargar();
  assert.deepEqual(entorno.elementos["sa-destinos"].opciones, ["UVA 140"]);
  assert.match(entorno.avisos.at(-1).mensaje, /Error cargando destinos/);
  assert.equal(entorno.avisos.at(-1).esError, true);
});
