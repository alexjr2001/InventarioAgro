const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "comun.js"), "utf8");
const codigo = source.slice(source.indexOf("async function consultarMovimientos("),
  source.indexOf("// Evita el doble envio"));

function crearConsulta(registros) {
  const llamadas = [];
  const db = {
    from(tabla) {
      const filtros = [];
      let inicio = 0;
      let fin = 49;
      const consulta = {
        select(columnas) { llamadas.push(["select", tabla, columnas]); return this; },
        order(campo) { llamadas.push(["order", campo]); return this; },
        eq(campo, valor) { filtros.push((r) => r[campo] === valor); llamadas.push(["eq", campo, valor]); return this; },
        ilike(campo, patron) {
          llamadas.push(["ilike", campo, patron]);
          const literal = patron.slice(1, -1).replace(/\\(.)/g, "$1").toUpperCase();
          filtros.push((r) => String(campo === "productos.nombre" ? r.productos.nombre : r[campo] || "")
            .toUpperCase().includes(literal));
          return this;
        },
        range(desde, hasta) { inicio = desde; fin = hasta; llamadas.push(["range", desde, hasta]); return this; },
        limit(numero) { inicio = 0; fin = numero - 1; llamadas.push(["limit", numero]); return this; },
        then(resolve, reject) {
          const data = registros.filter((r) => filtros.every((f) => f(r))).slice(inicio, fin + 1);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return consulta;
    },
  };
  const contexto = { db };
  vm.createContext(contexto);
  vm.runInContext(codigo, contexto);
  return { consultar: contexto.consultarMovimientos, llamadas };
}

test("sin filtros conserva las 50 entradas más recientes", async () => {
  const registros = Array.from({ length: 60 }, (_, i) => ({ id: i, productos: { nombre: "A" } }));
  const { consultar, llamadas } = crearConsulta(registros);
  const resultado = await consultar("entradas", [], () => true);
  assert.equal(resultado.data.length, 50);
  assert.ok(llamadas.some((c) => c[0] === "limit" && c[1] === 50));
});

test("combina nombre comercial, responsable, fecha y destino sobre todo el historial", async () => {
  const registros = Array.from({ length: 60 }, (_, i) => ({
    id: i, productos: { nombre: "OTRO" }, fecha: "2026-01-01", responsable: "OTRO", destino: "OTRO",
  }));
  registros.push({ id: 60, productos: { nombre: "FERTILIZANTE" }, fecha: "2026-02-01",
    responsable: "Ana Pérez", destino: "UVA 140" });
  const { consultar, llamadas } = crearConsulta(registros);
  const resultado = await consultar("salidas", [
    { campo: "productos.nombre", valor: "fertil" },
    { campo: "responsable", valor: "ANA" },
    { campo: "fecha", valor: "2026-02-01", fecha: true },
    { campo: "destino", valor: "uva" },
  ], () => true);
  assert.deepEqual(Array.from(resultado.data, (r) => r.id), [60]);
  assert.ok(llamadas.some((c) => c[0] === "select" && c[2].includes("productos!inner")));
  assert.ok(llamadas.some((c) => c[0] === "eq" && c[1] === "fecha"));
});

test("incluye todas las páginas filtradas y trata los comodines como texto", async () => {
  const registros = Array.from({ length: 1001 }, (_, i) => ({
    id: i, productos: { nombre: "A_10%*" }, fecha: "2026-02-01",
  }));
  const { consultar, llamadas } = crearConsulta(registros);
  const resultado = await consultar("entradas", [
    { campo: "productos.nombre", valor: "_10%*" },
    { campo: "fecha", valor: "2026-02-01", fecha: true },
  ], () => true);
  assert.equal(resultado.data.length, 1001);
  assert.ok(llamadas.some((c) => c[0] === "range" && c[1] === 1000));
  assert.ok(llamadas.some((c) => c[0] === "ilike" && c[2] === "%\\_10\\%\\*%"));
});

test("descarta una respuesta que ya no corresponde a los filtros actuales", async () => {
  const { consultar } = crearConsulta([{ id: 1, productos: { nombre: "A" } }]);
  assert.equal(await consultar("entradas", [], () => false), null);
});

function crearPanelFiltros() {
  const crearElemento = (extra = {}) => {
    const oyentes = {};
    const clases = new Set(["oculto"]);
    return {
      value: "", textContent: "", oyentes,
      classList: {
        contains: (c) => clases.has(c),
        toggle: (c, f) => (f ? clases.add(c) : clases.delete(c)),
      },
      addEventListener: (tipo, fn) => { oyentes[tipo] = fn; },
      setAttribute() {}, focus() {},
      ...extra,
    };
  };
  const quitarPanel = crearElemento();
  const quitarAviso = crearElemento();
  const spanAviso = crearElemento();
  const elementos = {
    nombre: crearElemento(), fecha: crearElemento(), boton: crearElemento(),
    panel: crearElemento({ querySelector: () => quitarPanel }),
    aviso: crearElemento({ querySelector: (s) => (s === "span" ? spanAviso : quitarAviso) }),
  };
  const inicio = source.indexOf("// Los filtros solo se aplican");
  const contexto = { $: (id) => elementos[id], fmtFecha: (f) => `F${f}` };
  vm.createContext(contexto);
  vm.runInContext(source.slice(inicio, source.indexOf("async function consultarMovimientos(")), contexto);
  let cargas = 0;
  const valor = contexto.configurarFiltros({
    campos: [{ id: "nombre", etiqueta: "Nombre" }, { id: "fecha", etiqueta: "Fecha", fecha: true }],
    cargar: () => { cargas++; }, boton: "boton", panel: "panel", aviso: "aviso",
  });
  return { elementos, valor, spanAviso, quitarAviso, cargas: () => cargas };
}

test("los filtros solo se aplican al pulsar aplicar y se quitan con quitar filtros", () => {
  const { elementos, valor, spanAviso, quitarAviso, cargas } = crearPanelFiltros();
  elementos.nombre.value = " urea ";
  elementos.fecha.value = "2026-02-01";
  assert.equal(valor("nombre"), "");
  assert.equal(cargas(), 0);

  elementos.panel.oyentes.submit({ preventDefault() {} });
  assert.equal(valor("nombre"), "urea");
  assert.equal(cargas(), 1);
  assert.equal(elementos.boton.textContent, "Filtrar (2)");
  assert.equal(elementos.aviso.classList.contains("oculto"), false);
  assert.equal(spanAviso.textContent, "Filtrando por: Nombre: urea · Fecha: F2026-02-01");

  elementos.nombre.value = "otro";
  assert.equal(valor("nombre"), "urea");

  quitarAviso.oyentes.click();
  assert.equal(valor("nombre"), "");
  assert.equal(elementos.nombre.value, "");
  assert.equal(cargas(), 2);
  assert.equal(elementos.boton.textContent, "Filtrar");
  assert.equal(elementos.aviso.classList.contains("oculto"), true);
});
