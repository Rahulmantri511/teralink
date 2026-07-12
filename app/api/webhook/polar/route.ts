import { NextRequest, NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { polar } from "../../../../lib/polar";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET ?? "";

    // Validate the event using the SDK webhook helper
    const event = validateEvent(body, headers, webhookSecret);

    console.log(`[Polar Webhook] Validated event of type: ${event.type}`);

    switch (event.type) {
      case "order.paid": {
        const orderData = event.data as any;
        const customerId = orderData.customerId || orderData.customer_id;
        console.log(`[Polar Webhook] Order paid: ${orderData.id}, Customer: ${customerId}`);

        if (customerId) {
          try {
            // Fetch customer from Polar API to retrieve our internal externalId mapping
            const customer = await polar.customers.get({ id: customerId });
            const externalId = customer.externalId || (customer as any).external_id;

            if (externalId) {
              const premiumUntil = new Date();
              premiumUntil.setMonth(premiumUntil.getMonth() + 1);
              const premiumUntilStr = premiumUntil.toISOString();

              console.log(`[Polar Webhook] Granting premium access to User ID: ${externalId} until ${premiumUntilStr}`);
              const { error: dbError } = await supabaseServer
                .from("profiles")
                .update({
                  is_premium: true,
                  premium_until: premiumUntilStr
                })
                .eq("id", externalId);

              if (dbError) {
                console.error(`[Polar Webhook] Database update error:`, dbError);
              }

              console.log(`[Polar Webhook] Full orderData:`, JSON.stringify(orderData));
              console.log(`[Polar Webhook] Recording purchase in payments table for User ID: ${externalId}`);
              const rawAmount = orderData.amount || orderData.totalAmount || orderData.total_amount || 0;
              const amountInRupees = rawAmount > 1000 ? Math.round(rawAmount / 100) : rawAmount;
              const { error: payDbError } = await supabaseServer
                .from("payments")
                .insert({
                  user_id: externalId,
                  email: customer.email || orderData.customerEmail || orderData.customer_email || "",
                  utr: orderData.id,
                  amount: amountInRupees,
                  status: "paid"
                });

              if (payDbError) {
                console.error(`[Polar Webhook] Payments table insertion error:`, payDbError);
              }
            } else {
              console.warn(`[Polar Webhook] No externalId found for customer: ${customerId}`);
            }
          } catch (err) {
            console.error(`[Polar Webhook] Failed to fetch customer details for order:`, err);
          }
        }
        break;
      }
      case "customer.state_changed": {
        const customer = event.data as any;
        const externalId = customer.externalId || customer.external_id;
        console.log(`[Polar Webhook] Customer state changed: ${customer.id}, externalId: ${externalId}`);

        if (externalId) {
          // Check if customer has active subscriptions or benefits
          const hasActiveSubscription = customer.subscriptions?.some((sub: any) => sub.status === "active") || false;
          const hasActiveBenefits = (customer.benefits?.length ?? 0) > 0;
          const isStillPremium = hasActiveSubscription || hasActiveBenefits;

          console.log(`[Polar Webhook] Syncing user ${externalId} premium state to: ${isStillPremium}`);
          const { error: dbError } = await supabaseServer
            .from("profiles")
            .update({ is_premium: isStillPremium })
            .eq("id", externalId);

          if (dbError) {
            console.error(`[Polar Webhook] Database update error:`, dbError);
          }
        }
        break;
      }
      default: {
        console.log(`[Polar Webhook] Ignoring unhandled event: ${event.type}`);
        break;
      }
    }

    return new NextResponse(null, { status: 202 });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      console.warn("[Polar Webhook] Invalid signature verification attempt");
      return new NextResponse("Invalid webhook signature", { status: 403 });
    }
    console.error("[Polar Webhook] Error processing event:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
