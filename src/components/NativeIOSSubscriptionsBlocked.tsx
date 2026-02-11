"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type NativeIOSSubscriptionsBlockedProps = {
  continueHref?: string;
};

export function NativeIOSSubscriptionsBlocked({
  continueHref = "/decks",
}: NativeIOSSubscriptionsBlockedProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Subscriptions unavailable in the iOS app</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          You can continue using Soma on the free plan in the iOS app.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto">
          <Button onClick={() => router.replace(continueHref)}>
            Continue on Free plan
          </Button>
        </div>
      </div>
    </div>
  );
}
