import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { resolveDbClientOptions } from "./config";
import * as schema from "./schema";

const globalForReadOnlyDb = globalThis as unknown as {
  __pppReadOnlySql?: ReturnType<typeof postgres>;
  __pppReadOnlyDb?: ReturnType<typeof createReadOnlyDb>;
};

function readOnlyConnectionString(): string {
  const configured = process.env.ASSISTANT_DATABASE_RO_URL;
  if (configured) return configured;

  // Local development and tests can use the local application database. In a
  // production deployment the assistant must have an explicitly configured,
  // grant-restricted connection rather than silently falling back to the app's
  // read/write credentials.
  if (process.env.NODE_ENV !== "production" && process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  throw new Error("ASSISTANT_DATABASE_RO_URL is not set");
}

function createReadOnlyDb() {
  const connectionString = readOnlyConnectionString();
  const client =
    globalForReadOnlyDb.__pppReadOnlySql ??
    postgres(connectionString, {
      ...resolveDbClientOptions({ ...process.env, DATABASE_URL: connectionString }, { max: 3 }),
      idle_timeout: 20,
    });

  if (process.env.NODE_ENV !== "production") {
    globalForReadOnlyDb.__pppReadOnlySql = client;
  }

  return drizzle(client, { schema });
}

export type ReadOnlyDb = ReturnType<typeof createReadOnlyDb>;

/**
 * Database client reserved for assistant-authored, application-defined reads.
 * Safety still depends on ASSISTANT_DATABASE_RO_URL belonging to a DB role
 * without write grants; this module never accepts model-authored SQL.
 */
export const readOnlyDb = new Proxy({} as ReadOnlyDb, {
  get(_target, prop, receiver) {
    const real = (globalForReadOnlyDb.__pppReadOnlyDb ??= createReadOnlyDb());
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
