const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">
        Payments are not configured for production. Complete payments setup to accept real payments.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-border bg-muted px-4 py-2 text-center text-xs text-muted-foreground">
        Test mode — no real charges are made. Use card 4242 4242 4242 4242 with any future date and CVC.
      </div>
    );
  }
  return null;
}