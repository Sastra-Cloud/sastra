import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { resolveDbClientOptions } from "./config";
import * as schema from "./schema";

// Reuse a single client/db across hot reloads in dev, and init lazily so that
// importing this module (e.g. during `next build`) doesn't require DATABASE_URL.
const globalForDb = globalThis as unknown as {
  __pppSql?: ReturnType<typeof postgres>;
  __pppDb?: ReturnType<typeof createDb>;
};

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  // Pool size, idle timeout, and prepared-statement mode come from the
  // environment (see ./config) so hosted instances can stay small and let a
  // scale-to-zero database sleep.
  const client =
    globalForDb.__pppSql ?? postgres(connectionString, resolveDbClientOptions(process.env));
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__pppSql = client;
  }
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

// Lazy proxy: the real connection is created on first use, not at import time.
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = (globalForDb.__pppDb ??= createDb());
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
