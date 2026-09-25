import { defineConfig } from "drizzle-kit";

// Node 20.6+/22 can load a dotenv file natively (drizzle-kit doesn't auto-load it).
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file — rely on the ambient environment (e.g. in CI / containers)
}

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
