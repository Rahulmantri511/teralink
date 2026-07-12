import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    // Basic email format validation to reduce bounce rate
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    // Block common disposable/temp email domains to reduce bounces
    const disposableDomains = ["mailinator.com", "guerrillamail.com", "10minutemail.com", "throwam.com", "trashmail.com", "yopmail.com", "temp-mail.org", "fakeinbox.com", "dispostable.com", "maildrop.cc"];
    const emailDomain = email.split("@")[1]?.toLowerCase();
    if (disposableDomains.includes(emailDomain)) {
      return NextResponse.json({ error: "Disposable email addresses are not allowed. Please use a real email." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const { data, error } = await supabaseServer.auth.signUp({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const session = data.session;
    const user = data.user;

    const response = NextResponse.json({ success: true, user });

    // If email confirmation is not required, session will be returned immediately
    if (session) {
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
    }

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "An unexpected error occurred" }, { status: 500 });
  }
}
