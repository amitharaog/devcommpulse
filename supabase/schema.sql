-- devcommpulse schema. Run once in Supabase → SQL Editor. Safe to re-run.
-- All app access uses the service-role key on the server, so RLS is enabled with
-- no public policies: the anon key cannot read or write anything.

create extension if not exists pgcrypto;

-- What Sumit monitors. Edit from the dashboard ("Topics & sources") or here.
create table if not exists topics (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text not null default '',
  keywords    text[] not null default '{}',   -- phrases: Reddit, HN, Stack Exchange search, devRant + local matching
  tags        text[] not null default '{}',   -- Stack Overflow tags that map to this topic
  active      boolean not null default true,
  origin      text not null default 'manual' check (origin in ('manual','ai')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Which communities are scraped, with per-source settings.
create table if not exists sources (
  id       text primary key,
  name     text not null,
  enabled  boolean not null default true,
  config   jsonb not null default '{}'::jsonb
);

-- Every collected post/question/comment. week_start = the Friday (UTC) that opens its Fri→Thu week.
create table if not exists posts (
  id               text primary key,               -- "<source>:<external id>"
  source           text not null,
  url              text not null,
  title            text not null,
  body             text,
  author           text,
  score            int not null default 0,
  comments         int not null default 0,
  posted_at        timestamptz not null,
  week_start       date not null,
  topic_slugs      text[] not null default '{}',
  matched_keywords text[] not null default '{}',
  answered         boolean,                        -- native signal where a source has one (Stack Exchange)
  analyzed         boolean not null default false,
  relevant         boolean,                        -- Gemini: is this really about the topic?
  sentiment        real,                           -- -1 … 1
  sentiment_label  text,
  is_pain          boolean,
  pain_point       text,
  unresolved       boolean,
  severity         smallint,
  fetched_at       timestamptz not null default now()
);
create index if not exists posts_week_idx on posts (week_start);
create index if not exists posts_topics_idx on posts using gin (topic_slugs);
create index if not exists posts_kw_idx on posts using gin (matched_keywords);
create index if not exists posts_unanalyzed_idx on posts (posted_at desc) where analyzed = false;

-- Clustered pain points per week (Gemini groups wording variants into one theme).
create table if not exists pain_themes (
  id             bigserial primary key,
  week_start     date not null,
  theme          text not null,
  topic_slug     text,
  mentions       int not null default 0,
  prev_mentions  int not null default 0,
  unresolved     int not null default 0,
  avg_sentiment  real,
  underserved    boolean not null default false,
  summary        text,
  example_ids    text[] not null default '{}',
  unique (week_start, theme)
);

-- The Friday brief itself.
create table if not exists digests (
  week_start    date primary key,
  headline      text not null,
  bullets       jsonb not null default '[]'::jsonb,
  watch         text,
  stats         jsonb not null default '{}'::jsonb,
  generated_at  timestamptz not null default now()
);

-- Audit log of keywords/topics the weekly run added on its own.
create table if not exists keyword_changes (
  id          bigserial primary key,
  topic_slug  text not null,
  keyword     text,
  action      text not null check (action in ('added_keyword','added_topic')),
  reason      text,
  created_at  timestamptz not null default now()
);

-- Cached on-demand deep dives (a second click is instant).
create table if not exists deep_dives (
  topic_slug  text not null,
  week_start  date not null,
  keyword     text not null default '',
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (topic_slug, week_start, keyword)
);

create table if not exists runs (
  id           bigserial primary key,
  stage        text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,
  stats        jsonb,
  error        text
);

alter table topics          enable row level security;
alter table sources         enable row level security;
alter table posts           enable row level security;
alter table pain_themes     enable row level security;
alter table digests         enable row level security;
alter table keyword_changes enable row level security;
alter table deep_dives      enable row level security;
alter table runs            enable row level security;

-- Weekly counts per topic. Posts Gemini marked irrelevant are excluded; posts not yet analysed still count.
create or replace function topic_weekly_stats(p_since date)
returns table (
  week_start date, topic_slug text, mentions bigint, pain bigint, unresolved bigint,
  negative bigint, analyzed bigint, avg_sentiment double precision, engagement bigint
)
language sql stable as $$
  select p.week_start, t.slug,
         count(*),
         count(*) filter (where p.is_pain),
         count(*) filter (where p.unresolved),
         count(*) filter (where p.sentiment < -0.2),
         count(*) filter (where p.analyzed),
         avg(p.sentiment),
         coalesce(sum(p.score + p.comments), 0)::bigint
  from posts p
  cross join lateral unnest(p.topic_slugs) as t(slug)
  where p.week_start >= p_since and coalesce(p.relevant, true)
  group by 1, 2;
$$;

create or replace function source_weekly_stats(p_since date)
returns table (week_start date, source text, mentions bigint, pain bigint)
language sql stable as $$
  select p.week_start, p.source, count(*), count(*) filter (where p.is_pain)
  from posts p
  where p.week_start >= p_since and coalesce(p.relevant, true) and cardinality(p.topic_slugs) > 0
  group by 1, 2;
$$;

-- Unique-post totals for one week (a post in two topics counts once).
create or replace function week_totals(p_week date)
returns table (total bigint, analyzed bigint, negative bigint, pain bigint, unresolved bigint)
language sql stable as $$
  select count(*), count(*) filter (where analyzed), count(*) filter (where sentiment < -0.2),
         count(*) filter (where is_pain), count(*) filter (where unresolved)
  from posts
  where week_start = p_week and coalesce(relevant, true) and cardinality(topic_slugs) > 0;
$$;

-- Applies a batch of Gemini results in one round trip.
create or replace function apply_analysis(items jsonb)
returns int
language sql as $$
  with x as (
    select * from jsonb_to_recordset(items) as r(
      id text, relevant boolean, topic_slugs text[], sentiment real, sentiment_label text,
      is_pain boolean, pain_point text, unresolved boolean, severity smallint)
  ), u as (
    update posts p set
      analyzed = true,
      relevant = x.relevant,
      topic_slugs = case when cardinality(coalesce(x.topic_slugs, '{}')) > 0 then x.topic_slugs else p.topic_slugs end,
      sentiment = x.sentiment,
      sentiment_label = x.sentiment_label,
      is_pain = x.is_pain,
      pain_point = nullif(x.pain_point, ''),
      unresolved = x.unresolved,
      severity = x.severity
    from x where p.id = x.id
    returning 1
  )
  select count(*)::int from u;
$$;

-- Tags already-collected posts with a newly added keyword, so a new keyword has history straight away.
create or replace function retag_keyword(p_slug text, p_keyword text, p_since date)
returns int
language sql as $$
  with u as (
    update posts set
      topic_slugs = case when p_slug = any(topic_slugs) then topic_slugs else array_append(topic_slugs, p_slug) end,
      matched_keywords = case when p_keyword = any(matched_keywords) then matched_keywords else array_append(matched_keywords, p_keyword) end
    where week_start >= p_since
      and (title || ' ' || coalesce(body, '')) ~* ('\m' || regexp_replace(p_keyword, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || 's?\M')
    returning 1
  )
  select count(*)::int from u;
$$;

-- ---------- Seed: Sumit's problem space (code review automation for mid-size teams) ----------
insert into topics (slug, name, description, keywords, tags) values
('review-bottlenecks', 'Slow reviews & PR bottlenecks',
 'Pull requests waiting on reviewers, review latency, large PRs, reviewer load.',
 array['code review','pull request review','pr review','waiting for review','review bottleneck','stale pull request','large pull request','review latency'],
 array['code-review','pull-request']),
('automated-review-quality', 'Automated & AI review quality',
 'Noise, false positives and trust problems with bots and AI reviewers.',
 array['false positive','ai code review','automated code review','review bot','noisy review','coderabbit','copilot review','ai reviewer','code review tool'],
 array['static-analysis']),
('ci-cd-friction', 'CI/CD pipeline friction',
 'Flaky tests, slow pipelines, broken CI integrations and failing checks.',
 array['flaky test','ci pipeline','github actions','gitlab ci','jenkins','slow ci','build time','pipeline failing','required checks'],
 array['github-actions','gitlab-ci','jenkins','continuous-integration','azure-pipelines','circleci']),
('static-analysis-linters', 'Static analysis & quality gates',
 'Linters, SonarQube-style quality gates, rule tuning and suppressions.',
 array['static analysis','sonarqube','linter','eslint','quality gate','semgrep','codeql','code smell'],
 array['sonarqube','eslint','codeql','semgrep']),
('review-culture', 'Review culture & team process',
 'Rubber-stamping, review etiquette, ownership and why review breaks in fast teams.',
 array['code review culture','rubber stamp','lgtm','review etiquette','merge without review','stacked pr','stacked diff','approval required','codeowners','nitpick'],
 array[]::text[]),
('merge-workflow', 'Merge & branching workflow',
 'Merge conflicts, merge queues, branch protection, monorepos, trunk-based development.',
 array['merge conflict','merge queue','branch protection','monorepo','trunk based','developer productivity','dora metrics'],
 array['merge-conflict-resolution','monorepo','branch-protection']),
('security-in-prs', 'Security & dependency checks in PRs',
 'Dependabot/Snyk noise, SAST in pipelines, secret scanning, supply chain.',
 array['dependabot','snyk','sast','secret scanning','vulnerability scan','supply chain','renovate bot'],
 array['dependabot','snyk'])
on conflict (slug) do nothing;

insert into sources (id, name, enabled, config) values
('stackexchange', 'Stack Overflow & Stack Exchange', true,
 '{"tag_sites":["stackoverflow","devops"],"keyword_sites":["softwareengineering"],"max_pages":5}'),
('reddit', 'Reddit', true,
 '{"subreddits":["programming","ExperiencedDevs","devops","softwareengineering","cscareerquestions","github","gitlab","webdev","softwaredevelopment"]}'),
('hackernews', 'Hacker News', true, '{"include_comments":true,"max_pages":2}'),
('devto', 'DEV Community (dev.to)', true,
 '{"tags":["codereview","cicd","devops","githubactions","git","testing","productivity","programming","ai","security"]}'),
('lobsters', 'Lobsters', true, '{"pages":8}'),
('devrant', 'devRant', true, '{}')
on conflict (id) do nothing;
