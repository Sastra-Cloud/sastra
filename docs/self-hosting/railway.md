# Railway

Sastra has a one-click Railway template that creates the app, a Postgres
database with pgvector, and a Railway Bucket for files. Railway bills your own
account by usage; a small team typically stays under $10 a month.

**Deploy:** use the "Deploy on Railway" button in the README, or search for
"Sastra" in Railway's template gallery.

After deploying:

1. Set `BETTER_AUTH_URL` to the public URL Railway assigned (or your custom
   domain), then redeploy.
2. Email: Railway blocks outbound SMTP on the Hobby plan, so set
   `RESEND_API_KEY` and `EMAIL_FROM` (a verified domain on Resend).
3. Files: the template wires the Bucket's `S3_*` variables automatically.
4. Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_TOKEN`, open `/login`, and create
   the first admin.
5. The template includes a cron service that calls `/api/cron/tick` every
   minute. Keep it running.

Migrations run at container start (`MIGRATE_ON_START=true`). To upgrade, change
the image tag in the service settings and redeploy.

Sastra Cloud itself does not run on Railway; the template is for your own
account.
