import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    // Verify Supabase session server-side
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.access_token) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          details: "Auth session missing!",
        },
        { status: 401 }
      );
    }

    // Get backend configuration (server-side only, not exposed to client)
    const backendUrl = process.env.BACKEND_URL;
    const backendApiKey = process.env.BACKEND_API_KEY;

    if (!backendUrl || !backendApiKey) {
      console.error("[ANKI PROXY] Missing backend configuration");
      return NextResponse.json(
        {
          error: "Server configuration error",
          details: "Backend URL or API key is missing. Please check your environment variables.",
        },
        { status: 500 }
      );
    }

    // Get FormData from request
    const formData = await request.formData();

    // Forward request to backend Railway
    const backendResponse = await fetch(`${backendUrl}/anki/import`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "x-soma-backend-key": backendApiKey,
      },
      body: formData,
    });

    // Get response body
    const responseText = await backendResponse.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { error: responseText };
    }

    // Forward response from backend
    return NextResponse.json(responseData, {
      status: backendResponse.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[ANKI PROXY] Fatal error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 }
    );
  }
}
