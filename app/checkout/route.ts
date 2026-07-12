import { NextRequest, NextResponse } from "next/server";
import { polar } from "../../lib/polar";
import { supabaseServer } from "../../lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const productsParam = searchParams.get("products");

  if (!productsParam) {
    return new NextResponse("Missing products parameter", { status: 400 });
  }

  const products = productsParam.split(",").map(p => p.trim());

  // Get logged-in user session
  const accessToken = req.cookies.get("sb-access-token")?.value;
  let externalCustomerId = undefined;
  let customerEmail = undefined;

  if (accessToken) {
    try {
      const { data: { user } } = await supabaseServer.auth.getUser(accessToken);
      if (user) {
        externalCustomerId = user.id;
        customerEmail = user.email;
      }
    } catch (err) {
      console.warn("Could not retrieve user session for checkout:", err);
    }
  }

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const origin = `${proto}://${host}`;
  const successUrl = `${origin}/`;

  try {
    const session = await polar.checkouts.create({
      products: products,
      customerEmail: customerEmail,
      customer_email: customerEmail,
      externalCustomerId: externalCustomerId,
      external_customer_id: externalCustomerId,
      successUrl: successUrl,
      success_url: successUrl,
    } as any);

    if (!session.url) {
      return new NextResponse("Failed to generate Polar checkout URL", { status: 500 });
    }

    return NextResponse.redirect(session.url, 302);
  } catch (error: any) {
    console.error("Error creating Polar checkout session:", error);
    return new NextResponse(`Failed to initiate checkout: ${error.message || error}`, { status: 500 });
  }
}
