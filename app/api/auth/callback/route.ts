import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") || "/";
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "http";
    const origin = host ? `${proto}://${host}` : new URL(request.url).origin;

    console.log("[Auth Callback] Received request:", request.url);
    console.log("[Auth Callback] Code parameter exists:", !!code);
    if (errorParam || errorDesc) {
      console.error("[Auth Callback] Error from Supabase URL:", errorParam, "-", errorDesc);
    }

    if (code) {
      const { data, error } = await supabaseServer.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("[Auth Callback] exchangeCodeForSession failed:", error.message, error.status);
      } else if (data?.session) {
        const session = data.session;
        console.log("[Auth Callback] Session successfully exchanged for user:", data.user?.email);
        
        const cookieStore = await cookies();
        
        cookieStore.set("sb-access-token", session.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: session.expires_in,
        });
        
        cookieStore.set("sb-refresh-token", session.refresh_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 7, // 7 days
        });

        return NextResponse.redirect(new URL(next, origin));
      } else {
        console.error("[Auth Callback] No session or error returned from exchangeCodeForSession");
      }
    }

    return NextResponse.redirect(new URL(`/?error=auth-failed&desc=${encodeURIComponent(errorDesc || "no_code")}`, origin));
  } catch (err: any) {
    console.error("[Auth Callback] Unexpected exception:", err);
    return NextResponse.redirect(new URL("/?error=auth-unexpected", origin));
  }
}
