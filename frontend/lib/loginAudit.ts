import type { NextRequest } from "next/server";

export type LoginAuditEntry = {
  name: string;
  email: string;
  ip: string;
  logged_in_at: string;
};

const MAX_ENTRIES = 500;
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

export async function readLoginAudit(): Promise<LoginAuditEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/logins`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return [];
    }
    const parsed = (await response.json()) as unknown;
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
    await fetch(`${API_BASE_URL}/auth/logins`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry)
    });
  } catch {
    // noop: login flow should not fail if audit storage is unavailable
  }
}
