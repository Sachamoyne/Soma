export type DetailLevel = "summary" | "standard" | "detailed";
export interface GenerationOptions {
    cardsCount?: number;
    detailLevel?: DetailLevel;
    isPdf?: boolean;
}
export interface CardPreview {
    front: string;
    back: string;
    tags?: string[];
    difficulty?: number;
}
export interface GeneratePreviewResult {
    success: true;
    deckId: string;
    cards: CardPreview[];
}
export interface GenerateCardsError {
    success: false;
    error: string;
    code?: string;
    message?: string;
    status: number;
    plan?: string;
    used?: number;
    limit?: number;
    remaining?: number;
    reset_at?: string;
}
export type GeneratePreviewResponse = GeneratePreviewResult | GenerateCardsError;
/**
 * Generate AI flashcards from text - PREVIEW ONLY, no database insertion.
 * Cards are returned for user review before confirmation.
 *
 * @param options.cardsCount - If defined, generate EXACTLY this many cards (3-50)
 * @param options.detailLevel - "summary" | "standard" | "detailed" (default: "standard")
 */
export declare function generateCardsPreview(text: string, deckId: string, userId: string, options?: GenerationOptions): Promise<GeneratePreviewResponse>;
export interface ConfirmCardsInput {
    deckId: string;
    userId: string;
    cards: CardPreview[];
}
export interface ConfirmCardsResult {
    success: true;
    deckId: string;
    imported: number;
    cards: CardPreview[];
}
export type ConfirmCardsResponse = ConfirmCardsResult | GenerateCardsError;
/**
 * Confirm and insert selected cards into the database.
 * This is called after user reviews and selects cards to keep.
 */
export declare function confirmAndInsertCards(input: ConfirmCardsInput): Promise<ConfirmCardsResponse>;
//# sourceMappingURL=ai-cards.d.ts.map