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

export type Cadence = "hourly" | "daily" | "weekly" | "monthly";
export type LengthTarget = "short" | "medium" | "long";
export type PublishStatus = "draft" | "publish";

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
  hourly: "Every hour",
  daily: "Once a day",
  weekly: "Once a week",
  monthly: "Once a month",
};

export const LENGTH_LABEL: Record<LengthTarget, string> = {
  short: "Short (~500 words)",
  medium: "Medium (~900 words)",
  long: "Long (~1500 words)",
};

export const LENGTH_WORDS: Record<LengthTarget, number> = {
  short: 500,
  medium: 900,
  long: 1500,
};
