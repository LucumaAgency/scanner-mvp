// Bootstrap CommonJS para Phusion Passenger.
// node-loader.js de Passenger usa require(), que no acepta módulos ESM
// en Node < 22.12. Este wrapper hace dynamic import del server real.
import("./backend/server.js").catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
