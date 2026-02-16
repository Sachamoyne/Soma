import { NextResponse } from "next/server";

/**
 * Apple App Site Association (AASA) file.
 *
 * Tells iOS that https://soma-edu.com/auth/native-callback should be
 * handled as a Universal Link by the Soma app. When the user is redirected
 * to this URL after OAuth, iOS intercepts it and fires the appUrlOpen
 * event in the Capacitor app instead of loading the web page.
 */
export function GET() {
  const aasa = {
    applinks: {
      details: [
        {
          appIDs: ["CK47UN75PT.com.sachamoyne.soma"],
          components: [
            { "/": "/auth/native-callback*" },
          ],
        },
      ],
    },
  };

  return NextResponse.json(aasa, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
