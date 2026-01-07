"use client";

import { createClient } from "./supabase/client";
import { getDeckAndAllChildren } from "@/store/decks";
import { useEffect, useState } from "react";

export interface ReviewByDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface HeatmapCell {
  date: string; // YYYY-MM-DD
  count: number;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
}

export interface CardStateBreakdown {
  new: number;
  learning: number;
  review: number;
}

export interface CardDistribution {
  new: number;
  learning: number;
  learned: number;
}

export interface ReviewStats {
  totalReviews: number;
  totalMinutes: number;
  retentionRate: number;
  ratings: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
}

/**
 * Get current user ID
 */
async function getCurrentUserId(): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }
  return data.user.id;
}

/**
 * Get reviews grouped by day for the last N days
 */
export async function getReviewsByDay(days: number): Promise<ReviewByDay[]> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const now = new Date();
  const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("reviewed_at")
    .eq("user_id", userId)
    .gte("reviewed_at", startTime.toISOString())
    .lte("reviewed_at", now.toISOString());

  if (error) {
    console.error("Error fetching reviews:", error);
    return [];
  }

  // Group by date
  const byDate = new Map<string, number>();
  for (const review of reviews || []) {
    const date = new Date(review.reviewed_at);
    const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
    byDate.set(dateStr, (byDate.get(dateStr) || 0) + 1);
  }

  // Fill in missing days with 0
  const result: ReviewByDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];
    result.push({
      date: dateStr,
      count: byDate.get(dateStr) || 0,
    });
  }

  return result;
}

/**
 * Get heatmap data for the last N days (GitHub-style)
 * Returns array of cells with date, count, and dayOfWeek
 */
export async function getHeatmapData(days: number): Promise<HeatmapCell[]> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const now = new Date();
  const startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("reviewed_at")
    .eq("user_id", userId)
    .gte("reviewed_at", startTime.toISOString())
    .lte("reviewed_at", now.toISOString());

  if (error) {
    console.error("Error fetching reviews for heatmap:", error);
    return [];
  }

  // Group by date
  const byDate = new Map<string, number>();
  for (const review of reviews || []) {
    const date = new Date(review.reviewed_at);
    const dateStr = date.toISOString().split("T")[0];
    byDate.set(dateStr, (byDate.get(dateStr) || 0) + 1);
  }

  // Create cells for all days
  const result: HeatmapCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.getDay();
    result.push({
      date: dateStr,
      count: byDate.get(dateStr) || 0,
      dayOfWeek,
    });
  }

  return result;
}

/**
 * Get card state breakdown (New / Learning / Review)
 * If deckId is provided, includes that deck and all sub-decks
 */
export async function getCardStateBreakdown(
  deckId?: string
): Promise<CardStateBreakdown> {
  const supabase = createClient();
  const userId = await getCurrentUserId();
  const now = new Date();
  let deckIds: string[];

  if (deckId) {
    deckIds = await getDeckAndAllChildren(deckId);
  } else {
    // All decks
    const { data: allDecks, error } = await supabase
      .from("decks")
      .select("id")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching decks:", error);
      return { new: 0, learning: 0, review: 0 };
    }
    deckIds = (allDecks || []).map((d) => d.id);
  }

  if (deckIds.length === 0) {
    return { new: 0, learning: 0, review: 0 };
  }

  const { data: cards, error } = await supabase
    .from("cards")
    .select("state, due_at")
    .in("deck_id", deckIds)
    .eq("user_id", userId)
    .eq("suspended", false);

  if (error) {
    console.error("Error fetching cards for breakdown:", error);
    return { new: 0, learning: 0, review: 0 };
  }

  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;

  for (const card of cards || []) {
    const dueAt = new Date(card.due_at);
    // Only count cards that are due now (consistent with getDueCards and Decks page logic)
    if (card.state === "new" && dueAt <= now) {
      newCount++;
    } else if (card.state === "learning" && dueAt <= now) {
      learningCount++;
    } else if (card.state === "review" && dueAt <= now) {
      reviewCount++;
    }
  }

  return { new: newCount, learning: learningCount, review: reviewCount };
}

/**
 * Get card distribution (New / Learning / Learned) based on reps and state
 * This is for the pie chart showing the overall card stock
 * If deckId is provided, includes that deck and all sub-decks
 */
export async function getCardDistribution(
  deckId?: string
): Promise<CardDistribution> {
  const supabase = createClient();
  const userId = await getCurrentUserId();
  let deckIds: string[];

  if (deckId) {
    deckIds = await getDeckAndAllChildren(deckId);
  } else {
    // All decks
    const { data: allDecks, error } = await supabase
      .from("decks")
      .select("id")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching decks:", error);
      return { new: 0, learning: 0, learned: 0 };
    }
    deckIds = (allDecks || []).map((d) => d.id);
  }

  if (deckIds.length === 0) {
    return { new: 0, learning: 0, learned: 0 };
  }

  const { data: cards, error } = await supabase
    .from("cards")
    .select("state, reps")
    .in("deck_id", deckIds)
    .eq("user_id", userId)
    .eq("suspended", false);

  if (error) {
    console.error("Error fetching cards for distribution:", error);
    return { new: 0, learning: 0, learned: 0 };
  }

  let newCount = 0;
  let learningCount = 0;
  let learnedCount = 0;

  for (const card of cards || []) {
    // Categorize based on card state (Anki logic)
    if (card.state === "new") {
      // New: never studied or not yet graduated
      newCount++;
    } else if (card.state === "learning" || card.state === "relearning") {
      // Learning: in learning steps or relearning after lapse
      learningCount++;
    } else if (card.state === "review") {
      // Learned: graduated to review (mature cards)
      learnedCount++;
    }
  }

  return { new: newCount, learning: learningCount, learned: learnedCount };
}

export async function getReviewStatsBetween(
  startIso: string,
  endIso: string
): Promise<ReviewStats> {
  const supabase = createClient();
  const userId = await getCurrentUserId();

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("rating, elapsed_ms, reviewed_at")
    .eq("user_id", userId)
    .gte("reviewed_at", startIso)
    .lte("reviewed_at", endIso);

  if (error) {
    console.error("Error fetching review stats:", error);
    return {
      totalReviews: 0,
      totalMinutes: 0,
      retentionRate: 0,
      ratings: { again: 0, hard: 0, good: 0, easy: 0 },
    };
  }

  const ratings = { again: 0, hard: 0, good: 0, easy: 0 };
  let totalMs = 0;

  for (const review of reviews || []) {
    const rating = review.rating as keyof typeof ratings;
    if (ratings[rating] !== undefined) {
      ratings[rating] += 1;
    }
    if (review.elapsed_ms) {
      totalMs += review.elapsed_ms;
    }
  }

  const totalReviews = (reviews || []).length;
  const retentionRate =
    totalReviews > 0 ? (totalReviews - ratings.again) / totalReviews : 0;

  return {
    totalReviews,
    totalMinutes: Math.round((totalMs / 1000 / 60) * 10) / 10,
    retentionRate,
    ratings,
  };
}

/**
 * Hook for reviews by day
 */
export function useReviewsByDay(days: number) {
  const [data, setData] = useState<ReviewByDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await getReviewsByDay(days);
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error loading reviews by day:", error);
        if (mounted) {
          setData([]);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [days]);

  return loading ? undefined : data;
}

/**
 * Hook for heatmap data
 */
export function useHeatmapData(days: number) {
  const [data, setData] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await getHeatmapData(days);
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error loading heatmap data:", error);
        if (mounted) {
          setData([]);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [days]);

  return loading ? undefined : data;
}

/**
 * Hook for card state breakdown
 */
export function useCardStateBreakdown(deckId?: string) {
  const [data, setData] = useState<CardStateBreakdown>({
    new: 0,
    learning: 0,
    review: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await getCardStateBreakdown(deckId);
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error loading card state breakdown:", error);
        if (mounted) {
          setData({ new: 0, learning: 0, review: 0 });
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [deckId]);

  return loading ? undefined : data;
}

/**
 * Hook for card distribution
 */
export function useCardDistribution(deckId?: string) {
  const [data, setData] = useState<CardDistribution>({
    new: 0,
    learning: 0,
    learned: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const result = await getCardDistribution(deckId);
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error loading card distribution:", error);
        if (mounted) {
          setData({ new: 0, learning: 0, learned: 0 });
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [deckId]);

  return loading ? undefined : data;
}
