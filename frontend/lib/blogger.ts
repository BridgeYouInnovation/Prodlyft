export interface WpConnection {
  id: string;
  user_id: number;
  site_url: string;
  site_name: string | null;
  wp_version: string | null;
  status: "active" | "broken";
  last_ping_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Allowed cadence values for a blog schedule. Each value encodes a number
 * of minutes — `computeNextRun()` reads it as such. Legacy values
 * (hourly/daily/weekly/monthly) still work in computeNextRun so existing
 * schedules don't break, but only the new set is offered in the form.
 */
export type Cadence =
  | "10min"
  | "30min"
  | "1h"
  | "2h"
  | "5h"
  | "12h"
  | "24h"
  | "48h";

export type LengthTarget = "short" | "medium" | "long";
export type PublishStatus = "draft" | "publish";

/** Cadence value → interval in minutes. Source of truth for computeNextRun. */
export const CADENCE_MINUTES: Record<Cadence, number> = {
  "10min": 10,
  "30min": 30,
  "1h":    60,
  "2h":    120,
  "5h":    300,
  "12h":   720,
  "24h":   1440,
  "48h":   2880,
};

export interface BlogSchedule {
  id: string;
  user_id: number;
  wp_connection_id: string;
  name: string;
  topics: string[];
  tone: string | null;
  length_target: LengthTarget;
  cadence: Cadence;
  publish_status: PublishStatus;
  default_categories: number[] | null;
  default_tags: string[] | null;
  generate_image: boolean;
  enabled: boolean;
  next_topic_index: number;
  last_run_at: string | null;
  next_run_at: string;
  /** Set once the schedule has published every topic. enabled also
   *  flips to false. UI uses this to render "Completed" vs "Paused". */
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogArticle {
  id: string;
  user_id: number;
  wp_connection_id: string | null;
  schedule_id: string | null;
  topic: string;
  tone: string | null;
  title: string | null;
  excerpt: string | null;
  body: string | null;
  image_url: string | null;
  image_prompt: string | null;
  status: "queued" | "generating" | "posted" | "failed";
  publish_status: PublishStatus;
  wp_post_id: number | null;
  wp_post_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const CADENCE_LABEL: Record<Cadence, string> = {
  "10min": "Every 10 minutes",
  "30min": "Every 30 minutes",
  "1h":    "Every hour",
  "2h":    "Every 2 hours",
  "5h":    "Every 5 hours",
  "12h":   "Every 12 hours",
  "24h":   "Every 24 hours",
  "48h":   "Every 48 hours",
};

export const LENGTH_LABEL: Record<LengthTarget, string> = {
  short: "Short (~600 words)",
  medium: "Medium (1000-1300 words)",
  long: "Long (2000+ words)",
};

/** Target word counts handed to the article-writer model. Mediums must
 *  hit at least 1000 words; longs must clear 2000. We target slightly
 *  above the floor because LLMs tend to undershoot prompts. */
export const LENGTH_WORDS: Record<LengthTarget, number> = {
  short: 600,
  medium: 1200,
  long: 2200,
};

/** Hard floors enforced in the system prompt — surface a clear "write
 *  AT LEAST N" instruction so the model doesn't pad-then-truncate. */
export const LENGTH_MIN_WORDS: Record<LengthTarget, number> = {
  short: 500,
  medium: 1000,
  long: 2000,
};
