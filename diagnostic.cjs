// CommonJS puro — funciona sin importar el "type" del package.json.
// Escribe diagnostic.log en el mismo directorio que este archivo.

const fs = require("fs");
const http = require("http");
const path = require("path");

const LOG = path.join(__dirname, "diagnostic.log");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG, line);
  } catch (e) {
    process.stderr.write(`(no se pudo escribir log: ${e.message})\n`);
  }
  process.stderr.write(line);
}

process.on("uncaughtException", (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`);
  log(err.stack || "(no stack)");
});

process.on("unhandledRejection", (reason) => {
  log(`UNHANDLED REJECTION: ${reason}`);
});

try {
  fs.writeFileSync(LOG, `\n=== run @ ${new Date().toISOString()} ===\n`);
  log(`Node version: ${process.version}`);
  log(`CWD: ${process.cwd()}`);
  log(`__dirname: ${__dirname}`);
  log(`Argv: ${process.argv.join(" ")}`);
  log(`PORT env: ${JSON.stringify(process.env.PORT)}`);
  log(`MONGO_URI set: ${Boolean(process.env.MONGO_URI)}`);
  log(`MONGO_URI length: ${(process.env.MONGO_URI || "").length}`);
  log(`MONGO_DB env: ${process.env.MONGO_DB || "(unset)"}`);
  log(`NODE_ENV: ${process.env.NODE_ENV || "(unset)"}`);
} catch (e) {
  process.stderr.write(`FATAL al escribir log inicial: ${e.message}\n`);
}

try {
  require("mongodb");
  log("mongodb: require OK");
} catch (e) {
  log(`mongodb: require FAILED → ${e.message}`);
}

try {
  require("express");
  log("express: require OK");
} catch (e) {
  log(`express: require FAILED → ${e.message}`);
}

try {
  require("dotenv");
  log("dotenv: require OK");
} catch (e) {
  log(`dotenv: require FAILED → ${e.message}`);
}

const port = process.env.PORT || 3000;
log(`About to listen on: ${JSON.stringify(port)}`);

try {
  http
    .createServer((req, res) => {
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
    })
    .listen(port, () => {
      log(`HTTP listening on ${port}`);
    });
} catch (e) {
  log(`listen FAILED → ${e.message}`);
}
