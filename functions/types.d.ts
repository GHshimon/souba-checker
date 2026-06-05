/// <reference types="@cloudflare/workers-types" />

import type { Env } from "./_utils/helpers";

declare global {
  type PagesFunction<E = Env> = (context: EventContext<E, string, Record<string, unknown>>) => Response | Promise<Response>;
}

export {};
