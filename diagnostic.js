// Script de diagnóstico — usar como Application Startup File en Plesk temporalmente.
// Escribe diagnostic.log en la raíz del proyecto con info de qué falla al arrancar.

import { writeFileSync, appendFileSync } from "node:fs";
import { createServer } from "node:http";

const LOG = "diagnostic.log";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(LOG, line);
  } catch {
    /* ignore */
  }
  process.stderr.write(line);
}

try {
  writeFileSync(LOG, `\n=== New run at ${new Date().toISOString()} ===\n`);
  log(`Node version: ${process.version}`);
  log(`CWD: ${process.cwd()}`);
  log(`Argv: ${process.argv.join(" ")}`);
  log(`PORT env: ${JSON.stringify(process.env.PORT)}`);
  log(`MONGO_URI set: ${Boolean(process.env.MONGO_URI)}`);
  log(`MONGO_URI length: ${(process.env.MONGO_URI || "").length}`);
  log(`MONGO_DB env: ${process.env.MONGO_DB || "(unset)"}`);
  log(`NODE_ENV: ${process.env.NODE_ENV || "(unset)"}`);
} catch (e) {
  process.stderr.write(`FATAL al escribir log: ${e.message}\n`);
}

(async () => {
  try {
    await import("mongodb");
    log("mongodb: import OK");
  } catch (e) {
    log(`mongodb: import FAILED → ${e.message}`);
  }

  try {
    await import("express");
    log("express: import OK");
  } catch (e) {
    log(`express: import FAILED → ${e.message}`);
  }

  try {
    await import("dotenv/config");
    log("dotenv: import OK");
  } catch (e) {
    log(`dotenv: import FAILED → ${e.message}`);
  }

  const port = process.env.PORT || 3000;
  log(`About to listen on: ${JSON.stringify(port)}`);

  try {
    createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          time: new Date().toISOString(),
          node: process.version,
          cwd: process.cwd(),
          mongoUriSet: Boolean(process.env.MONGO_URI),
        })
      );
    }).listen(port, () => {
      log(`HTTP listening on ${port}`);
    });
  } catch (e) {
    log(`listen FAILED → ${e.message}`);
  }
})().catch((e) => {
  log(`UNHANDLED → ${e.message}\n${e.stack}`);
});
