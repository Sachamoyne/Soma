"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileText, Image as ImageIcon, RefreshCw } from "lucide-react";
import { listImports, generateCards, type GenerateCardsResult, type CardProposal, type ImportDoc } from "@/store/imports";
import { useUserPlan } from "@/hooks/useUserPlan";

interface ImportsListProps {
  deckId: string;
  deckName?: string;
  onGenerateAgain: (importId: string, cards: CardProposal[]) => void;
}

export function ImportsList({
  deckId,
  deckName,
  onGenerateAgain,
}: ImportsListProps) {
  const [imports, setImports] = useState<ImportDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  // Check user plan to disable AI generation
  const userPlan = useUserPlan();
  const canUseAI = userPlan?.canUseAI ?? false;

  useEffect(() => {
    async function loadImports() {
      try {
        const loaded = await listImports(deckId);
        setImports(loaded);
      } catch (error) {
        console.error("Error loading imports:", error);
      } finally {
        setLoading(false);
      }
    }
    loadImports();
  }, [deckId]);

  const handleGenerateAgain = async (importId: string) => {
    setGenerating(importId);
    try {
      const result: GenerateCardsResult = await generateCards(importId, deckId, deckName, 20);
      onGenerateAgain(importId, result.cards);
    } catch (error) {
      console.error("Error generating cards:", error);
      alert("Failed to generate cards: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setGenerating(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading imports...</p>;
  }

  if (imports.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 space-y-4">
      <Separator />
      <div>
        <h3 className="mb-4 text-lg font-semibold">Recent Imports</h3>
        <div className="space-y-3">
          {imports.map((importDoc) => (
            <Card key={importDoc.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {importDoc.file_type === "pdf" ? (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-base">{importDoc.filename}</CardTitle>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerateAgain(importDoc.id)}
                    disabled={generating === importDoc.id || !canUseAI}
                    title={!canUseAI ? "Fonctionnalité réservée aux abonnés" : undefined}
                  >
                    {generating === importDoc.id ? (
                      <>
                        <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-3 w-3" />
                        Generate again
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    {importDoc.file_type === "pdf" && importDoc.page_count
                      ? `${importDoc.page_count} page(s)`
                      : importDoc.file_type === "image" && importDoc.ocr_confidence
                        ? `OCR: ${Math.round(importDoc.ocr_confidence * 100)}%`
                        : null}
                  </p>
                  <p className="text-xs">
                    {new Date(importDoc.created_at).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

