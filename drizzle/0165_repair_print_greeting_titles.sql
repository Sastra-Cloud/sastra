-- The parser used the first line of a forwarded email as the book title, so
-- runs and quotes could be named "Hi Bora," or "Regards,". Run titles also feed
-- print payment and wire request wording. Only exact greeting or sign-off shapes
-- change: a greeting must end in a comma, so titles such as "Dear Theophilus" and
-- "Thanks Be to God" stay. Prices, statuses, and updated_at are not touched.
UPDATE "print_runs" AS r
SET "title" = p."title"
FROM "projects" AS p
WHERE p."id" = r."project_id"
  AND r."title" ~* '^\s*(hi|hello|hey|dear|greetings|good\s+(morning|afternoon|evening|day))\y[^.!?]*,\s*$|^\s*((kind|best|warm|many)\s+)?(regards|thanks|thank you|sincerely|cheers)[,.!]?\s*$';
--> statement-breakpoint
UPDATE "print_quotes"
SET "title" = NULL
WHERE "title" ~* '^\s*(hi|hello|hey|dear|greetings|good\s+(morning|afternoon|evening|day))\y[^.!?]*,\s*$|^\s*((kind|best|warm|many)\s+)?(regards|thanks|thank you|sincerely|cheers)[,.!]?\s*$';
