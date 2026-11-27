const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("el responsable de salida solo permite elegir las opciones autorizadas", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const campo = html.match(/<label>Responsable \/ Operario\s*([\s\S]*?)<\/label>/);

  assert.ok(campo, "debe existir el campo de responsable");
  assert.match(campo[1], /<select id="sa-responsable">/);
  assert.deepEqual(
    [...campo[1].matchAll(/<option value="([^"]+)">/g)].map(([, value]) => value),
    ["Robert", "Jhon", "Elvis", "Percy", "Dr Gomez"],
  );
  assert.doesNotMatch(campo[1], /<input\b/);
});
