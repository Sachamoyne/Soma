export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateCardsPreview } from "@/lib/ai-cards";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MIN_TEXT_LENGTH = 50; // Minimum chars to consider PDF has text layer

// Error codes for PDF extraction
type PDFErrorCode =
  | "PDF_NO_TEXT"
  | "PDF_ENCRYPTED"
  | "PDF_INVALID"
  | "PDF_PARSE_ERROR"
  | "PDF_TOO_LARGE";

interface PDFExtractionResult {
  success: true;
  text: string;
  pages: number;
}

interface PDFExtractionError {
  success: false;
  code: PDFErrorCode;
  message: string;
  details?: string;
}

/**
 * Extract text from a PDF buffer using pdf-parse v2
 */
async function extractTextFromPdf(
  buffer: Buffer
): Promise<PDFExtractionResult | PDFExtractionError> {
  console.log("[extractTextFromPdf] START - buffer info:", {
    bufferLength: buffer.length,
    isBuffer: Buffer.isBuffer(buffer),
    header: buffer.slice(0, 20).toString("utf8"),
  });

  // Validate PDF header
  const header = buffer.slice(0, 8).toString("utf8");
  if (!header.startsWith("%PDF")) {
    console.error("[extractTextFromPdf] Invalid PDF header:", header);
    return {
      success: false,
      code: "PDF_INVALID",
      message: "Le fichier n'est pas un PDF valide.",
      details: `Invalid header: ${header.substring(0, 20)}`,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parser: any = null;

  try {
    // Dynamic import to ensure proper ESM loading in Next.js
    // Use require() fallback for better compatibility with Vercel serverless
    console.log("[extractTextFromPdf] Loading pdf-parse module (dynamic import)...");
    
    let pdfParseModule: any;
    try {
      // Try ESM dynamic import first
      pdfParseModule = await import("pdf-parse");
    } catch (importError) {
      // Fallback to require for better Vercel compatibility
      console.log("[extractTextFromPdf] ESM import failed, trying require...", importError);
      pdfParseModule = require("pdf-parse");
    }
    
    console.log("[extractTextFromPdf] Module loaded, keys:", Object.keys(pdfParseModule));

    // pdf-parse v2 exports PDFParse as named export
    // Handle both named export and default export
    const PDFParse = pdfParseModule.PDFParse || pdfParseModule.default?.PDFParse || pdfParseModule.default;
    
    console.log("[extractTextFromPdf] PDFParse type:", typeof PDFParse);

    if (!PDFParse) {
      console.error("[extractTextFromPdf] PDFParse not found in module");
      console.error("[extractTextFromPdf] Available exports:", Object.keys(pdfParseModule));
      throw new Error("PDFParse class not found in pdf-parse module");
    }

    console.log("[extractTextFromPdf] Creating parser instance...");
    // Ensure buffer is a proper Buffer instance for Vercel
    const bufferInstance = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    parser = new PDFParse({ data: bufferInstance });
    console.log("[extractTextFromPdf] Parser created, type:", typeof parser);

    console.log("[extractTextFromPdf] Calling getText()...");
    const result = await parser.getText();
    console.log("[extractTextFromPdf] getText() returned:", {
      resultType: typeof result,
      resultKeys: result ? Object.keys(result) : "null",
    });

    const pages = result?.total || 0;
    const rawText = result?.text || "";

    console.log("[extractTextFromPdf] Extraction complete:", {
      pages,
      rawTextLength: rawText.length,
      textPreview: rawText.substring(0, 100),
    });

    // Check if PDF has meaningful text (lowered threshold to 50)
    if (rawText.length < 50) {
      return {
        success: false,
        code: "PDF_NO_TEXT",
        message:
          "Ce PDF ne contient pas de texte sélectionnable. Il s'agit probablement d'un PDF scanné (image). Veuillez utiliser un PDF avec du texte.",
        details: `Extracted only ${rawText.length} characters from ${pages} pages`,
      };
    }

    return {
      success: true,
      text: rawText,
      pages,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : "Unknown";
    const errorStack = error instanceof Error ? error.stack : "";
    
    // Enhanced error logging for Vercel debugging
    console.error("[extractTextFromPdf] CATCH ERROR:", {
      name: errorName,
      message: errorMessage,
      stack: errorStack,
      bufferLength: buffer?.length,
      environment: process.env.NODE_ENV,
      vercel: process.env.VERCEL ? "true" : "false",
      errorDetails: error instanceof Error ? {
        code: (error as any).code,
        errno: (error as any).errno,
        syscall: (error as any).syscall,
      } : undefined,
    });

    // Detect encrypted PDFs
    if (
      errorMessage.includes("password") ||
      errorMessage.includes("encrypted") ||
      errorMessage.includes("PasswordException")
    ) {
      return {
        success: false,
        code: "PDF_ENCRYPTED",
        message:
          "Ce PDF est protégé par un mot de passe. Veuillez le déverrouiller avant de l'importer.",
        details: errorMessage,
      };
    }

    // Detect invalid PDF structure
    if (
      errorMessage.includes("Invalid PDF") ||
      errorMessage.includes("invalid") ||
      errorMessage.includes("InvalidPDFException")
    ) {
      return {
        success: false,
        code: "PDF_INVALID",
        message:
          "Ce fichier PDF semble corrompu ou mal formé. Veuillez essayer un autre fichier.",
        details: errorMessage,
      };
    }

    // Generic parse error
    return {
      success: false,
      code: "PDF_PARSE_ERROR",
      message:
        "Impossible d'extraire le texte de ce PDF. Veuillez essayer un autre fichier.",
      details: errorMessage,
    };
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Normalize extracted text from PDF
 * Removes extra line breaks, headers, footers when possible
 */
function normalizeText(text: string): string {
  // Remove excessive line breaks (more than 2 consecutive)
  let normalized = text.replace(/\n{3,}/g, "\n\n");

  // Remove common header/footer patterns (page numbers, dates, etc.)
  normalized = normalized.replace(/^\d+\s*$/gm, ""); // Standalone page numbers
  normalized = normalized.replace(/Page \d+ of \d+/gi, ""); // Page X of Y
  normalized = normalized.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ""); // Dates

  // Remove excessive whitespace
  normalized = normalized.replace(/[ \t]+/g, " ");

  // Trim each line
  normalized = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return normalized.trim();
}

export async function POST(request: NextRequest) {
  console.log("[generate-cards-from-pdf] Request received");

  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.log("[generate-cards-from-pdf] Auth failed");
      return NextResponse.json(
        { success: false, code: "UNAUTHORIZED", message: "Non autorisé" },
        { status: 401 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const deckId = formData.get("deck_id") as string | null;

    // Validate inputs
    if (!file) {
      return NextResponse.json(
        { success: false, code: "NO_FILE", message: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    if (!deckId) {
      return NextResponse.json(
        { success: false, code: "NO_DECK_ID", message: "Deck ID requis" },
        { status: 400 }
      );
    }

    // Validate file type
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_FILE_TYPE",
          message: "Type de fichier invalide. Seuls les PDF sont supportés.",
        },
        { status: 415 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          code: "PDF_TOO_LARGE",
          message: "Le PDF est trop volumineux. Taille maximale : 15 MB.",
        },
        { status: 413 }
      );
    }

    console.log("[generate-cards-from-pdf] File info:", {
      name: file.name,
      size: file.size,
      sizeMB: (file.size / 1024 / 1024).toFixed(2),
      type: file.type,
    });

    // Verify deck exists and belongs to user
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("id, user_id")
      .eq("id", deckId)
      .single();

    if (deckError || !deck) {
      return NextResponse.json(
        { success: false, code: "DECK_NOT_FOUND", message: "Deck non trouvé" },
        { status: 404 }
      );
    }

    if (deck.user_id !== user.id) {
      return NextResponse.json(
        {
          success: false,
          code: "FORBIDDEN",
          message: "Ce deck ne vous appartient pas",
        },
        { status: 403 }
      );
    }

    // Convert File to Buffer
    console.log("[generate-cards-from-pdf] Converting file to buffer...");
    const fileArrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(fileArrayBuffer);

    console.log("[generate-cards-from-pdf] Buffer created:", {
      bufferLength: pdfBuffer.length,
      header: pdfBuffer.slice(0, 8).toString("utf8"),
    });

    // Extract text from PDF
    console.log("[generate-cards-from-pdf] Extracting text...");
    const extractionResult = await extractTextFromPdf(pdfBuffer);

    if (!extractionResult.success) {
      console.log("[generate-cards-from-pdf] Extraction failed:", extractionResult);
      // Map error codes to HTTP status
      const statusMap: Record<PDFErrorCode, number> = {
        PDF_NO_TEXT: 422,
        PDF_ENCRYPTED: 422,
        PDF_INVALID: 400,
        PDF_PARSE_ERROR: 422,
        PDF_TOO_LARGE: 413,
      };
      return NextResponse.json(
        {
          success: false,
          code: extractionResult.code,
          message: extractionResult.message,
          error: extractionResult.message, // For backward compatibility with front-end
        },
        { status: statusMap[extractionResult.code] || 422 }
      );
    }

    // Normalize the extracted text
    const extractedText = normalizeText(extractionResult.text);

    console.log("[generate-cards-from-pdf] Text extracted successfully:", {
      pages: extractionResult.pages,
      rawLength: extractionResult.text.length,
      normalizedLength: extractedText.length,
      preview: extractedText.substring(0, 100),
    });

    // Check if normalized text is sufficient
    if (extractedText.length < MIN_TEXT_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          code: "PDF_NO_TEXT",
          message:
            "Le texte extrait est trop court. Le PDF ne contient peut-être pas assez de texte sélectionnable.",
          error:
            "Le texte extrait est trop court. Le PDF ne contient peut-être pas assez de texte sélectionnable.",
        },
        { status: 422 }
      );
    }

    // Generate cards preview (NO insertion yet)
    console.log("[generate-cards-from-pdf] Generating cards preview from extracted text...");

    const result = await generateCardsPreview({
      text: extractedText,
      deckId: deckId,
      userId: user.id,
    });

    // Handle error responses
    if (!result.success) {
      console.log("[generate-cards-from-pdf] Card generation failed:", result.error);
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          message: result.message,
          plan: result.plan,
          used: result.used,
          limit: result.limit,
          remaining: result.remaining,
          reset_at: result.reset_at,
        },
        { status: result.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Success - return preview (cards NOT inserted yet)
    console.log("[generate-cards-from-pdf] Successfully generated preview:", result.cards.length);
    return NextResponse.json(
      {
        deck_id: result.deckId,
        cards: result.cards,
        // Note: 'imported' is not returned here because cards are not inserted yet
      },
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-cards-from-pdf] Unexpected error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Failed to process PDF",
      },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
