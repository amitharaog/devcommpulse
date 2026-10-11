export const SOURCE_LABELS: Record<string, string> = {
  stackoverflow: "Stack Overflow",
  stackexchange: "Stack Exchange",
  reddit: "Reddit",
  hackernews: "Hacker News",
  devto: "DEV",
  lobsters: "Lobsters",
  devrant: "devRant",
};
export const sourceLabel = (id: string) => SOURCE_LABELS[id] ?? id;
