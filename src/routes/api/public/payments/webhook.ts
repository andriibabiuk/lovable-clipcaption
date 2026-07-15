import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

async function setRole(userId: string, role: "free" | "premium") {
  const supabase = getSupabase();
  await supabase.from("user_roles").delete().eq("user_id", userId);
  await supabase.from("user_roles").insert({ user_id: userId, role });
}

async function upsertSubscription(
  userId: string,
  planType: "free" | "premium",
  status: "active" | "canceled",
  renewalDate: string | null,
) {
  const supabase = getSupabase();
  await supabase
    .from("subscriptions")
    .upsert(
      { user_id: userId, plan_type: planType, status, renewal_date: renewalDate },
      { onConflict: "user_id" },
    );
  await supabase
    .from("profiles")
    .update({ subscription_status: status, renewal_date: renewalDate })
    .eq("id", userId);
}

function periodEndIso(subscription: any): string | null {
  const item = subscription.items?.data?.[0];
  const endUnix = item?.current_period_end ?? subscription.current_period_end;
  return endUnix ? new Date(endUnix * 1000).toISOString() : null;
}

async function handleSubscriptionActive(subscription: any) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("[webhook] subscription missing metadata.userId", subscription.id);
    return;
  }
  const status = subscription.status as string;
  // active or trialing (or past_due with grace) → premium
  const isPremium = ["active", "trialing", "past_due"].includes(status);
  if (isPremium) {
    await setRole(userId, "premium");
    await upsertSubscription(userId, "premium", "active", periodEndIso(subscription));
  } else if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
    await setRole(userId, "free");
    await upsertSubscription(userId, "free", "canceled", null);
  }
}

async function handleSubscriptionDeleted(subscription: any) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  await setRole(userId, "free");
  await upsertSubscription(userId, "free", "canceled", null);
}

async function handle(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionActive(event.data.object);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object);
      break;
    default:
      console.log("[webhook] unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("[webhook] invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handle(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("[webhook] error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});