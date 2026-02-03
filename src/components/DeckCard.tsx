"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useIsApp } from "@/hooks/useIsApp";
import { appHref } from "@/lib/appHref";

interface DeckCardProps {
  id: string;
  name: string;
  cardCount: number;
}

export function DeckCard({ id, name, cardCount }: DeckCardProps) {
  const isApp = useIsApp();

  return (
    <Link href={appHref(`/decks/${id}`, isApp)}>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle className="line-clamp-2">{name}</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary">{cardCount} card{cardCount !== 1 ? "s" : ""}</Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

