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
        const { data: profile } = await supabaseServer.from("profiles").select("is_premium, premium_until, play_count").eq("id", user.id).single();
        const isPremium = !!profile?.is_premium && (!profile?.premium_until || new Date(profile.premium_until) > new Date());
        const playCount = isPremium ? 0 : (profile?.premium_until && new Date(profile.premium_until) < new Date() ? 0 : profile?.play_count || 0);
        return NextResponse.json({ user: { ...user, is_premium: isPremium, play_count: playCount } });
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

        const { data: profile } = await supabaseServer.from("profiles").select("is_premium, premium_until, play_count").eq("id", user.id).single();
        const isPremium = !!profile?.is_premium && (!profile?.premium_until || new Date(profile.premium_until) > new Date());
        const playCount = isPremium ? 0 : (profile?.premium_until && new Date(profile.premium_until) < new Date() ? 0 : profile?.play_count || 0);
        return NextResponse.json({ user: { ...user, is_premium: isPremium, play_count: playCount } });
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

    const { data: profile } = await supabaseServer.from("profiles").select("is_premium, play_count").eq("id", user.id).single();
    return NextResponse.json({ success: true, user: { ...user, is_premium: profile?.is_premium || false, play_count: profile?.play_count || 0 } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "An unexpected error occurred" }, { status: 500 });
  }
}
