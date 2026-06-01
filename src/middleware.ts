import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "teco_admin_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return NextResponse.next();
  }

  const session = request.cookies.get(COOKIE_NAME)?.value;
  if (!session) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const proto = host.includes("admin.wofory.com") ? "https" : forwardedProto;
    const loginUrl = new URL("/login", `${proto}://${host}`);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
