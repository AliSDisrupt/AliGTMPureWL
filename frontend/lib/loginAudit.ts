import type { NextRequest } from "next/server";
import { MongoClient } from "mongodb";

export type LoginAuditEntry = {
  name: string;
  email: string;
  ip: string;
  logged_in_at: string;
};

const MAX_ENTRIES = 500;
const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? "purewl";
const MONGODB_COLLECTION_NAME = process.env.MONGODB_COLLECTION_NAME ?? "user_login_activity";

let mongoClient: MongoClient | null = null;

function getMongoClient(): MongoClient | null {
  if (!MONGODB_URI) {
    return null;
  }
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
  }
  return mongoClient;
}

export async function readLoginAudit(): Promise<LoginAuditEntry[]> {
  try {
    const client = getMongoClient();
    if (!client) {
      return [];
    }
    await client.connect();
    const collection = client.db(MONGODB_DB_NAME).collection(MONGODB_COLLECTION_NAME);
    const parsed = (await collection.find({}, { sort: { logged_in_at: -1 }, limit: MAX_ENTRIES }).toArray()) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is LoginAuditEntry => {
        return (
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as LoginAuditEntry).name === "string" &&
          typeof (entry as LoginAuditEntry).email === "string" &&
          typeof (entry as LoginAuditEntry).ip === "string" &&
          typeof (entry as LoginAuditEntry).logged_in_at === "string"
        );
      })
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [firstIp] = forwarded.split(",");
    return firstIp.trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function appendLoginAudit(entry: LoginAuditEntry): Promise<void> {
  try {
    const client = getMongoClient();
    if (!client) {
      return;
    }
    await client.connect();
    const collection = client.db(MONGODB_DB_NAME).collection(MONGODB_COLLECTION_NAME);
    await collection.insertOne({
      name: entry.name,
      email: entry.email.toLowerCase(),
      ip: entry.ip,
      logged_in_at: entry.logged_in_at
    });
  } catch {
    // noop: login flow should not fail if audit storage is unavailable
  }
}
