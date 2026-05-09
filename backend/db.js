import { MongoClient } from "mongodb";

let client;
let db;

export async function connect() {
  if (db) return db;

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB || "scanner_inmobiliario";

  if (!uri) throw new Error("MONGO_URI no configurada");

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  db = client.db(dbName);
  return db;
}

export function getListings() {
  if (!db) throw new Error("Mongo no conectado todavía");
  return db.collection("listings");
}

export function getDistricts() {
  if (!db) throw new Error("Mongo no conectado todavía");
  return db.collection("districts");
}

export async function close() {
  if (client) await client.close();
}
