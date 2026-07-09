import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("sb-access-token")?.value;
    const refreshToken = cookieStore.get("sb-refresh-token")?.value;

    if (accessToken) {
      // Verify access token
      const { data: { user }, error } = await supabaseServer.auth.getUser(accessToken);
      if (!error && user) {
        return NextResponse.json({ user });
      }
    }

    // Try refreshing the session if access token is invalid/expired
    if (refreshToken) {
      const { data: { session, user }, error } = await supabaseServer.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (!error && session && user) {
        // Set refreshed cookies
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

        return NextResponse.json({ user });
      }
    }

    // Clear cookies if session cannot be retrieved
    cookieStore.delete("sb-access-token");
    cookieStore.delete("sb-refresh-token");
    return NextResponse.json({ user: null });
  } catch (err: any) {
    return NextResponse.json({ user: null });
  }
}

export async function POST(request: Request) {
  try {
    const { accessToken, refreshToken, expiresIn } = await request.json();

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: "Tokens are required" }, { status: 400 });
    }

    // Validate access token with Supabase
    const { data: { user }, error } = await supabaseServer.auth.getUser(accessToken);

    if (error || !user) {
      return NextResponse.json({ error: error?.message || "Invalid token" }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set("sb-access-token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expiresIn ? parseInt(expiresIn, 10) : 3600,
    });

    cookieStore.set("sb-refresh-token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "An unexpected error occurred" }, { status: 500 });
  }
}
