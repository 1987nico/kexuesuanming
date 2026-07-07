import { NextResponse, type NextRequest } from "next/server";
import { MIANBA_SESSION_COOKIE } from "@/lib/auth/constants";

function isPublicMianbaPath(pathname: string) {
  return pathname === "/mianba/login" || pathname.startsWith("/mianba/reports/new");
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(MIANBA_SESSION_COOKIE)?.value);

  if (pathname === "/mianba/login" && hasSession) {
    return NextResponse.redirect(new URL("/mianba", req.url));
  }

  if (pathname.startsWith("/mianba") && !isPublicMianbaPath(pathname) && !hasSession) {
    const loginUrl = new URL("/mianba/login", req.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/mianba/:path*"],
};
