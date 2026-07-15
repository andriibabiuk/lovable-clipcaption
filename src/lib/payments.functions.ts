import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type StripeEnvIn = "sandbox" | "live";

type CheckoutResult = { clientSecret: string } | { error: string };
type CancelResult = { ok: true } | { error: string };

/**
 * Resolve or create a Stripe Customer keyed by our internal userId. Putting
 * userId on the Customer object (not just the Session) is what makes later
 * lookups via `customers.search` / `subscriptions.search` reliable.
 */
async function resolveOrCreateCustomer(
  stripe: import("stripe").default,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");

  const bySearch = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (bySearch.data.length) return bySearch.data[0].id;

  if (options.email) {
    const byEmail = await stripe.customers.list({ email: options.email, limit: 1 });
    if (byEmail.data.length) {
      const c = byEmail.data[0];
      if (c.metadata?.userId !== options.userId) {
        await stripe.customers.update(c.id, {
          metadata: { ...c.metadata, userId: options.userId },
        });
      }
      return c.id;
    }
  }

  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { userId: options.userId },
  });
  return created.id;
}

export const createPremiumCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        returnUrl: z.string().url(),
        environment: z.enum(["sandbox", "live"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const { createStripeClient, getStripeErrorMessage } = await import(
        "@/lib/stripe.server"
      );
      const stripe = createStripeClient(data.environment as StripeEnvIn);

      const { data: userData } = await context.supabase.auth.getUser();
      const email = userData.user?.email ?? undefined;
      const userId = context.userId;

      const prices = await stripe.prices.list({ lookup_keys: ["premium_monthly"] });
      if (!prices.data.length) throw new Error("Premium price not found");
      const price = prices.data[0];

      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: price.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        metadata: { userId },
        subscription_data: { metadata: { userId } },
      });

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      const { getStripeErrorMessage } = await import("@/lib/stripe.server");
      return { error: getStripeErrorMessage(error) };
    }
  });

/**
 * Cancel the user's active Stripe subscription immediately. The
 * `customer.subscription.deleted` webhook downgrades their role back to free.
 */
export const cancelPremiumSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ environment: z.enum(["sandbox", "live"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CancelResult> => {
    try {
      const { createStripeClient, getStripeErrorMessage } = await import(
        "@/lib/stripe.server"
      );
      const stripe = createStripeClient(data.environment as StripeEnvIn);
      const userId = context.userId;

      if (!/^[a-zA-Z0-9_-]+$/.test(userId)) throw new Error("Invalid userId");

      const found = await stripe.subscriptions.search({
        query: `metadata['userId']:'${userId}' AND status:'active'`,
        limit: 10,
      });

      if (!found.data.length) {
        // No active Stripe subscription — still ensure role is downgraded.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
        await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "free" });
        await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              plan_type: "free",
              status: "canceled",
              renewal_date: null,
            },
            { onConflict: "user_id" },
          );
        await supabaseAdmin
          .from("profiles")
          .update({ subscription_status: "canceled", renewal_date: null })
          .eq("id", userId);
        return { ok: true };
      }

      for (const sub of found.data) {
        await stripe.subscriptions.cancel(sub.id);
      }
      return { ok: true };
    } catch (error) {
      const { getStripeErrorMessage } = await import("@/lib/stripe.server");
      return { error: getStripeErrorMessage(error) };
    }
  });