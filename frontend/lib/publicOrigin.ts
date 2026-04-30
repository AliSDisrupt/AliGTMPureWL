import type { NextRequest } from "next/server";

export function getPublicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "") ?? "https";

  if (host) {
    return `${proto}://${host}`;
  }

  return request.nextUrl.origin;
}
