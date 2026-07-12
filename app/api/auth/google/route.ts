import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const redirectToHost = searchParams.get("redirect_to") || "";

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || "http";
    const serverOrigin = host ? `${proto}://${host}` : new URL(request.url).origin;

    const origin = redirectToHost || serverOrigin;
    const callbackUrl = origin.endsWith("/") ? origin : `${origin}/`;

    console.log("[Google Auth API] redirectToHost:", redirectToHost, "host header:", host, "proto header:", proto, "resolved serverOrigin:", serverOrigin, "final callbackUrl:", callbackUrl);

    const { data, error } = await supabaseServer.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data?.url) {
      return NextResponse.redirect(data.url);
    }

    return NextResponse.json({ error: "Could not generate Google login URL" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "An unexpected error occurred" }, { status: 500 });
  }
}
