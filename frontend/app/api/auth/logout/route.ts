import { NextRequest, NextResponse } from "next/server";
import { getPublicOrigin } from "../../../../lib/publicOrigin";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", getPublicOrigin(request)));
  response.cookies.set("purewl_auth", "", { path: "/", maxAge: 0 });
  response.cookies.set("purewl_auth_name", "", { path: "/", maxAge: 0 });
  response.cookies.set("purewl_auth_email", "", { path: "/", maxAge: 0 });
  response.cookies.set("purewl_auth_picture", "", { path: "/", maxAge: 0 });
  response.cookies.set("purewl_google_oauth_state", "", { path: "/", maxAge: 0 });
  return response;
}
