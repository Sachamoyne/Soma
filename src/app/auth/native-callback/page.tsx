"use client";

import dynamic from "next/dynamic";

const NativeCallbackBridge = dynamic(
  () => import("./NativeCallbackBridge"),
  { ssr: false },
);

export default function NativeCallbackPage() {
  return <NativeCallbackBridge />;
}
