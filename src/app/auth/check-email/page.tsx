import { Suspense } from "react";
import CheckEmailClient from "./CheckEmailClient";

export default function CheckEmailPage() {
  return (
    <Suspense fallback={null}>
      <CheckEmailClient />
    </Suspense>
  );
}
