import { NextResponse } from "next/server";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const redirectToHost = searchParams.get("redirect_to") || "";

    const origin = redirectToHost || (typeof window !== "undefined" ? window.location.origin : "");
    const callbackUrl = `${request.headers.get("origin") || new URL(request.url).origin}/`;

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
