/**
 * Anki SM-2 Scheduler Implementation
 *
 * This implements the legacy Anki scheduling algorithm (SM-2 modified)
 * NOT FSRS.
 *
 * Key concepts:
 * - Learning: New cards go through learning steps (e.g., "1m 10m")
 * - Graduating: After final learning step, cards graduate to Review
 * - Review: Uses SM-2 with ease factor, intervals
 * - Relearning: Failed review cards go through relearning steps
 * - Lapses: Count of times a card has been forgotten
 */

import type { Card, Settings } from "./supabase-db";

export interface SchedulerSettings {
  starting_ease: number;
  easy_bonus: number;
  hard_interval: number;
}

export interface SchedulingResult {
  state: "new" | "learning" | "review" | "relearning";
  due_at: Date;
  interval_days: number;
  ease: number;
  learning_step_index: number;
  reps: number;
  lapses: number;
}

export interface IntervalPreview {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

const DEFAULT_LEARNING_STEPS_MINUTES = [1];
const DEFAULT_GRADUATING_INTERVAL_DAYS = 1;
const DEFAULT_SETTINGS: SchedulerSettings = {
  starting_ease: 2.5,
  easy_bonus: 1.3,
  hard_interval: 1.2,
};

// ============================================================================
// STEP PARSING
// ============================================================================

/**
 * Parse learning steps string into minutes
 * Examples:
 * - "1m 10m" -> [1, 10]
 * - "1m 10m 1d" -> [1, 10, 1440]
 * - "10m 1d 3d" -> [10, 1440, 4320]
 */
export function parseSteps(stepsStr: string): number[] {
  if (!stepsStr || stepsStr.trim() === "") {
    return [];
  }

  return stepsStr
    .trim()
    .split(/\s+/)
    .map((step) => {
      step = step.toLowerCase().trim();

      // Match patterns like: 1m, 10m, 1d, 1h
      const match = step.match(/^(\d+(?:\.\d+)?)(m|h|d)?$/);
      if (!match) {
        console.warn(`Invalid step format: "${step}", skipping`);
        return 0;
      }

      const value = parseFloat(match[1]);
      const unit = match[2] || "m"; // default to minutes

      switch (unit) {
        case "m":
          return value;
        case "h":
          return value * 60;
        case "d":
          return value * 24 * 60;
        default:
          return value;
      }
    })
    .filter((v) => v > 0);
}

/**
 * Check if a step duration crosses a day boundary (interday)
 * Steps >= 1 day are interday and should be scheduled to tomorrow
 */
export function isInterday(stepMinutes: number): boolean {
  return stepMinutes >= 1440; // >= 24 hours
}

/**
 * Convert minutes to a human-readable string
 */
export function formatInterval(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }
  const days = Math.round(minutes / 1440);
  if (days === 1) return "1 jour";
  if (days < 30) return `${days} jours`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "1 mois" : `${months} mois`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? "1 an" : `${years} ans`;
}

/**
 * Convert days to human-readable string
 */
export function formatIntervalDays(days: number): string {
  if (days < 1) return "<1 jour";
  if (days === 1) return "1 jour";
  if (days < 30) return `${Math.round(days)} jours`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? "1 mois" : `${months} mois`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? "1 an" : `${years} ans`;
}

// ============================================================================
// DATE HELPERS
// ============================================================================

/**
 * Calculate due date from now + delay in minutes
 * For interday steps (>= 1 day), schedule to tomorrow at review time (e.g., 4am)
 */
function calculateDueDate(delayMinutes: number, now: Date = new Date()): Date {
  if (isInterday(delayMinutes)) {
    // Interday: schedule to next day at 4am (configurable)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + Math.floor(delayMinutes / 1440));
    tomorrow.setHours(4, 0, 0, 0);
    return tomorrow;
  } else {
    // Intraday: exact time
    return new Date(now.getTime() + delayMinutes * 60 * 1000);
  }
}

/**
 * Calculate due date from now + days
 */
function calculateDueDateDays(days: number, now: Date = new Date()): Date {
  const due = new Date(now);
  due.setDate(due.getDate() + Math.round(days));
  due.setHours(4, 0, 0, 0); // Schedule reviews for 4am
  return due;
}

/**
 * Clamp ease factor between min and max
 */
function clampEase(ease: number, min: number = 1.3, max: number = 3.0): number {
  return Math.max(min, Math.min(max, ease));
}

// ============================================================================
// SCHEDULING LOGIC
// ============================================================================

/**
 * Schedule a NEW card
 */
function scheduleNew(
  rating: "again" | "hard" | "good" | "easy",
  settings: SchedulerSettings,
  now: Date = new Date()
): SchedulingResult {
  const steps = DEFAULT_LEARNING_STEPS_MINUTES;
  const normalizedSettings = { ...DEFAULT_SETTINGS, ...settings };

  // Again: go to first step
  if (rating === "again") {
    const stepMinutes = steps[0];
    return {
      state: "learning",
      due_at: calculateDueDate(stepMinutes, now),
      interval_days: 0,
      ease: normalizedSettings.starting_ease,
      learning_step_index: 0,
      reps: 0,
      lapses: 0,
    };
  }

  // Good: go to first step (new cards start at step 0)
  if (rating === "good" || rating === "hard") {
    return {
      state: "learning",
      due_at: calculateDueDate(steps[0], now),
      interval_days: 0,
      ease: normalizedSettings.starting_ease,
      learning_step_index: 0,
      reps: 1,
      lapses: 0,
    };
  }

  // Easy: graduate immediately with 1 day
  return {
    state: "review",
    due_at: calculateDueDateDays(DEFAULT_GRADUATING_INTERVAL_DAYS, now),
    interval_days: DEFAULT_GRADUATING_INTERVAL_DAYS,
    ease: normalizedSettings.starting_ease,
    learning_step_index: 0,
    reps: 1,
    lapses: 0,
  };
}

/**
 * Schedule a LEARNING card
 */
function scheduleLearning(
  card: Card,
  rating: "again" | "hard" | "good" | "easy",
  settings: SchedulerSettings,
  now: Date = new Date()
): SchedulingResult {
  const steps = DEFAULT_LEARNING_STEPS_MINUTES;
  const currentStepIndex = card.learning_step_index || 0;

  // Again: back to first step
  if (rating === "again") {
    const stepMinutes = steps[0];
    return {
      state: "learning",
      due_at: calculateDueDate(stepMinutes, now),
      interval_days: 0,
      ease: card.ease,
      learning_step_index: 0,
      reps: card.reps,
      lapses: card.lapses,
    };
  }

  // Good: advance to next step or graduate
  if (rating === "good" || rating === "hard") {
    const nextStepIndex = currentStepIndex + 1;

    if (nextStepIndex >= steps.length) {
      // Graduate
      return {
        state: "review",
        due_at: calculateDueDateDays(DEFAULT_GRADUATING_INTERVAL_DAYS, now),
        interval_days: DEFAULT_GRADUATING_INTERVAL_DAYS,
        ease: card.ease,
        learning_step_index: 0,
        reps: card.reps + 1,
        lapses: card.lapses,
      };
    }

    // Move to next step
    return {
      state: "learning",
      due_at: calculateDueDate(steps[nextStepIndex], now),
      interval_days: 0,
      ease: card.ease,
      learning_step_index: nextStepIndex,
      reps: card.reps + 1,
      lapses: card.lapses,
    };
  }

  // Easy: graduate immediately with 1 day
  return {
    state: "review",
    due_at: calculateDueDateDays(DEFAULT_GRADUATING_INTERVAL_DAYS, now),
    interval_days: DEFAULT_GRADUATING_INTERVAL_DAYS,
    ease: card.ease,
    learning_step_index: 0,
    reps: card.reps + 1,
    lapses: card.lapses,
  };
}

/**
 * Schedule a REVIEW card
 */
function scheduleReview(
  card: Card,
  rating: "again" | "hard" | "good" | "easy",
  settings: SchedulerSettings,
  now: Date = new Date()
): SchedulingResult {
  const normalizedSettings = { ...DEFAULT_SETTINGS, ...settings };
  let ease = card.ease || normalizedSettings.starting_ease;
  let interval = card.interval_days || DEFAULT_GRADUATING_INTERVAL_DAYS;
  let lapses = card.lapses;

  // Again: reset interval and decrease ease
  if (rating === "again") {
    ease = clampEase(ease - 0.2);
    lapses += 1;
    interval = DEFAULT_GRADUATING_INTERVAL_DAYS;
    return {
      state: "review",
      due_at: calculateDueDateDays(interval, now),
      interval_days: interval,
      ease: ease,
      learning_step_index: 0,
      reps: card.reps + 1,
      lapses: lapses,
    };
  }

  // Hard
  if (rating === "hard") {
    ease = clampEase(ease - 0.15);
    interval = interval * normalizedSettings.hard_interval;
  }

  // Good
  if (rating === "good") {
    interval = interval * ease;
  }

  // Easy
  if (rating === "easy") {
    ease = clampEase(ease + 0.15);
    interval = interval * ease * normalizedSettings.easy_bonus;
  }

  interval = Math.max(DEFAULT_GRADUATING_INTERVAL_DAYS, Math.round(interval));

  return {
    state: "review",
    due_at: calculateDueDateDays(interval, now),
    interval_days: interval,
    ease: ease,
    learning_step_index: 0,
    reps: card.reps + 1,
    lapses: lapses,
  };
}

/**
 * Schedule a RELEARNING card
 */
function scheduleRelearning(
  card: Card,
  rating: "again" | "hard" | "good" | "easy",
  settings: SchedulerSettings,
  now: Date = new Date()
): SchedulingResult {
  return scheduleLearning(card, rating, settings, now);
}

// ============================================================================
// MAIN SCHEDULING FUNCTION
// ============================================================================

/**
 * Grade a card and calculate next review
 */
export function gradeCard(
  card: Card,
  rating: "again" | "hard" | "good" | "easy",
  settings: SchedulerSettings,
  now: Date = new Date()
): SchedulingResult {
  const state = card.state as "new" | "learning" | "review" | "relearning";

  switch (state) {
    case "new":
      return scheduleNew(rating, settings, now);
    case "learning":
      return scheduleLearning(card, rating, settings, now);
    case "review":
      return scheduleReview(card, rating, settings, now);
    case "relearning":
      return scheduleRelearning(card, rating, settings, now);
    default:
      throw new Error(`Unknown card state: ${state}`);
  }
}

/**
 * Preview intervals for all buttons (for UI display)
 */
export function previewIntervals(
  card: Card,
  settings: SchedulerSettings
): IntervalPreview {
  const now = new Date();

  const againResult = gradeCard(card, "again", settings, now);
  const hardResult = gradeCard(card, "hard", settings, now);
  const goodResult = gradeCard(card, "good", settings, now);
  const easyResult = gradeCard(card, "easy", settings, now);

  // Format intervals
  const formatResult = (result: SchedulingResult) => {
    if (result.state === "learning" || result.state === "relearning") {
      const minutes = Math.round(
        (result.due_at.getTime() - now.getTime()) / (60 * 1000)
      );
      return formatInterval(minutes);
    } else {
      return formatIntervalDays(result.interval_days);
    }
  };

  return {
    again: formatResult(againResult),
    hard: formatResult(hardResult),
    good: formatResult(goodResult),
    easy: formatResult(easyResult),
  };
}
