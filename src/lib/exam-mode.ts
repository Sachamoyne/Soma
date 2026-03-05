/**
 * Exam Mode — pure utility functions
 *
 * These functions compute exam preparation metrics without touching the SM-2
 * scheduler or any database state.  All side-effects (DB reads/writes) live
 * in supabase-db.ts and deck-settings.ts.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ExamStats {
  examDate: string;          // ISO date string "YYYY-MM-DD"
  daysRemaining: number;
  minimumExposures: number;
  dailyTarget: number;
  deckSize: number;
  reviewsDoneInPeriod: number;
  readinessScore: number;    // 0–100
}

// ============================================================================
// CORE FORMULAS
// ============================================================================

/**
 * Returns the minimum number of times each card must appear before the exam.
 *
 * > 30 days → 5 exposures
 * 14–30 days → 4 exposures
 * 7–14 days  → 3 exposures
 * ≤ 7 days   → 2 exposures
 */
export function getMinimumExposures(daysRemaining: number): number {
  if (daysRemaining > 30) return 5;
  if (daysRemaining > 14) return 4;
  if (daysRemaining > 7) return 3;
  return 2;
}

/**
 * Daily target: how many card reviews to do today to meet the goal.
 *
 * remaining_reviews = (deckSize × minExposures) − reviewsDoneInPeriod
 * daily_target      = ceil(remaining_reviews / daysRemaining)
 *
 * Clamped to at least 1 and at most deckSize × minExposures.
 */
export function getDailyTarget(
  deckSize: number,
  minExposures: number,
  reviewsDoneInPeriod: number,
  daysRemaining: number
): number {
  if (daysRemaining <= 0 || deckSize === 0) return 0;
  const totalNeeded = deckSize * minExposures;
  const remaining = Math.max(0, totalNeeded - reviewsDoneInPeriod);
  return Math.ceil(remaining / daysRemaining);
}

/**
 * Readiness score (0–100).
 *
 * For each card: contribution = min(exposuresForCard / minExposures, 1)
 * Score = average(contributions) × 100
 *
 * A card with 0 exposures contributes 0; a card that has met the minimum
 * contributes 1 (regardless of extra reviews).
 */
export function getReadinessScore(
  deckSize: number,
  exposuresPerCard: number[],  // length === deckSize, one entry per card
  minExposures: number
): number {
  if (deckSize === 0 || minExposures === 0) return 100;
  const total = exposuresPerCard.reduce(
    (sum, exp) => sum + Math.min(exp / minExposures, 1),
    0
  );
  return Math.round((total / deckSize) * 100);
}

/**
 * After SM-2 grading, decide whether to override the computed due_at.
 *
 * If the SM-2 due_at is after the exam AND the card hasn't reached the
 * minimum exposures yet, we return a new due_at that distributes the
 * remaining reviews evenly before the exam.
 *
 * Returns null if no override is needed (SM-2 result is fine as-is).
 */
export function computeCapDueDate(
  examDate: Date,
  cardExposuresInPeriod: number,
  minExposures: number,
  smDueAt: Date,
  now: Date = new Date()
): Date | null {
  // SM-2 already schedules before the exam — no override needed
  if (smDueAt <= examDate) return null;

  // Card has already met the minimum — no override needed
  if (cardExposuresInPeriod >= minExposures) return null;

  const daysUntilExam = Math.max(
    1,
    Math.floor((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );
  const remainingExposures = minExposures - cardExposuresInPeriod;

  // Distribute remaining reviews evenly; always leave at least 1 day before exam
  const intervalDays = Math.max(1, Math.floor(daysUntilExam / remainingExposures));
  const cappedDays = Math.min(intervalDays, daysUntilExam - 1);

  const cappedDue = new Date(now);
  cappedDue.setDate(cappedDue.getDate() + Math.max(1, cappedDays));
  cappedDue.setHours(4, 0, 0, 0);

  // Never schedule past the day before the exam
  const dayBeforeExam = new Date(examDate);
  dayBeforeExam.setDate(dayBeforeExam.getDate() - 1);
  dayBeforeExam.setHours(4, 0, 0, 0);

  return cappedDue <= dayBeforeExam ? cappedDue : dayBeforeExam;
}

/**
 * Parse a "YYYY-MM-DD" exam date string and compute today's days remaining.
 * Returns 0 if the exam is today or in the past.
 */
export function getDaysRemaining(examDateStr: string, now: Date = new Date()): number {
  const exam = new Date(examDateStr + "T00:00:00");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diffMs = exam.getTime() - today.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Returns the start date of the exam preparation period.
 * We count reviews done since (today − daysRemaining), i.e. the span
 * from when exam mode would have started until now.
 */
export function getExamPeriodStart(daysRemaining: number, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setDate(start.getDate() - daysRemaining);
  start.setHours(0, 0, 0, 0);
  return start;
}
