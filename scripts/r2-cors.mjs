// Configure CORS on the R2 bucket so the browser can PUT uploads to presigned
// URLs. Without this, browser uploads fail with "Failed to fetch" because the
// PUT (Content-Type: application/pdf, etc.) triggers a CORS preflight the bucket
// won't answer.
//
// Usage (origins default to http://localhost:3243):
//   node --env-file=.env scripts/r2-cors.mjs
//   node --env-file=.env scripts/r2-cors.mjs http://localhost:3243 https://planner.example.com
//
// Re-run any time the set of app origins changes. Reversible: re-run with a
// different origin list, or delete the policy in the Cloudflare dashboard.
import {
  S3Client,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";

// Same name resolution as lib/r2/config.ts (R2_* preferred, S3_* alias), kept
// inline because this plain-node script cannot import the TypeScript module.
const pick = (r2Name, s3Name) =>
  process.env[r2Name]?.trim() || process.env[s3Name]?.trim() || undefined;

const R2_ENDPOINT = pick("R2_ENDPOINT", "S3_ENDPOINT");
const R2_ACCESS_KEY_ID = pick("R2_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = pick("R2_SECRET_ACCESS_KEY", "S3_SECRET_ACCESS_KEY");
const R2_BUCKET = pick("R2_BUCKET", "S3_BUCKET");
const R2_REGION = pick("R2_REGION", "S3_REGION") ?? "auto";

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
  console.error(
    "Missing storage env vars (R2_* or S3_*). Run with: node --env-file=.env scripts/r2-cors.mjs [origin ...]"
  );
  process.exit(1);
}

const origins = process.argv.slice(2);
if (origins.length === 0) origins.push("http://localhost:3243");

const client = new S3Client({
  region: R2_REGION,
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const rule = {
  AllowedOrigins: origins,
  AllowedMethods: ["GET", "PUT", "HEAD"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag"],
  MaxAgeSeconds: 3600,
};

const before = await client
  .send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }))
  .then((r) => r.CORSRules)
  .catch((e) => `(${e.name})`);
console.log("Current CORS:", JSON.stringify(before, null, 2));

await client.send(
  new PutBucketCorsCommand({
    Bucket: R2_BUCKET,
    CORSConfiguration: { CORSRules: [rule] },
  })
);

console.log(`\n✓ CORS set on "${R2_BUCKET}" for: ${origins.join(", ")}`);
