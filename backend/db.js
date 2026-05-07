import { MongoClient } from "mongodb";

let client;
let listings;

export async function connect() {
  if (listings) return listings;

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB || "scanner_inmobiliario";

  if (!uri) throw new Error("MONGO_URI no configurada");

  client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  listings = client.db(dbName).collection("listings");
  return listings;
}

export function getListings() {
  if (!listings) throw new Error("Mongo no conectado todavía");
  return listings;
}

export async function close() {
  if (client) await client.close();
}
