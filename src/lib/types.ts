export type Topic = {
  id: string;
  slug: string;
  name: string;
  description: string;
  keywords: string[];
  tags: string[];
  active: boolean;
  origin: "manual" | "ai";
};

export type Source = {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

/** A post as returned by a source adapter, before topic matching. */
export type RawPost = {
  id: string; // "<source>:<external id>"
  source: string;
  url: string;
  title: string;
  body: string;
  author?: string;
  score: number;
  comments: number;
  postedAt: Date;
  answered?: boolean | null;
  /** Topic slugs implied by how the post was found (e.g. a Stack Overflow tag). */
  hintTopics?: string[];
  /** Keyword that was searched to find it, if any. */
  hintKeyword?: string;
};

export type PostRow = {
  id: string;
  source: string;
  url: string;
  title: string;
  body: string | null;
  score: number;
  comments: number;
  posted_at: string;
  week_start: string;
  topic_slugs: string[];
  matched_keywords: string[];
  answered: boolean | null;
  analyzed: boolean;
  relevant: boolean | null;
  sentiment: number | null;
  sentiment_label: string | null;
  is_pain: boolean | null;
  pain_point: string | null;
  unresolved: boolean | null;
  severity: number | null;
};

export type TopicWeekStat = {
  week_start: string;
  topic_slug: string;
  mentions: number;
  pain: number;
  unresolved: number;
  negative: number;
  analyzed: number;
  avg_sentiment: number | null;
  engagement: number;
};

export type PainTheme = {
  week_start: string;
  theme: string;
  topic_slug: string | null;
  mentions: number;
  prev_mentions: number;
  unresolved: number;
  avg_sentiment: number | null;
  underserved: boolean;
  summary: string | null;
  example_ids: string[];
};

export type Digest = {
  week_start: string;
  headline: string;
  bullets: string[];
  watch: string | null;
  stats: Record<string, unknown>;
  generated_at: string;
};
