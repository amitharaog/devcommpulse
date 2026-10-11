import type { Adapter } from "./context";
import { stackexchange } from "./stackexchange";
import { reddit } from "./reddit";
import { hackernews } from "./hackernews";
import { devto } from "./devto";
import { lobsters } from "./lobsters";
import { devrant } from "./devrant";

export const ADAPTERS: Record<string, Adapter> = { stackexchange, reddit, hackernews, devto, lobsters, devrant };
