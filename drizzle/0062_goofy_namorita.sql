-- Recreate the enum instead of ALTER TYPE ... ADD VALUE so the new target can
-- be used by the backfill in the same transaction on PostgreSQL.
ALTER TYPE "public"."attach_target" RENAME TO "attach_target_old";
CREATE TYPE "public"."attach_target" AS ENUM(
	'message', 'task', 'rights_item', 'budget_item', 'project', 'email_message',
	'print_quote', 'print_payment', 'agreement_group'
);
ALTER TABLE "file_attachments"
	ALTER COLUMN "target_type" TYPE "public"."attach_target"
	USING "target_type"::text::"public"."attach_target";
DROP TYPE "public"."attach_target_old";--> statement-breakpoint
CREATE TABLE "shared_mou_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"counterparty" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"signed_date" date,
	"currency" text DEFAULT 'USD' NOT NULL,
	"agreement_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"source_import_id" uuid,
	"administrative_project_id" uuid NOT NULL,
	"manager_notes" text,
	"review_required" boolean DEFAULT false NOT NULL,
	"review_note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_mou_membership_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"membership_id" uuid,
	"project_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_allocation" numeric(14, 2),
	"next_allocation" numeric(14, 2),
	"reason" text NOT NULL,
	"manager_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_mou_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"allocation_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"added_by" text,
	"added_reason" text NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"removed_by" text,
	"removed_reason" text,
	"removed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shared_mou_receipt_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"membership_id" uuid,
	"project_id" uuid NOT NULL,
	"funding_receipt_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_mou_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"received_date" date,
	"source" text,
	"note" text,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "shared_mou_group_id" uuid;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "shared_mou_group_id" uuid;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "readiness_status" text DEFAULT 'locked' NOT NULL;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "readiness_reason" text;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD COLUMN "readiness_evaluated_at" timestamp;--> statement-breakpoint
ALTER TABLE "shared_mou_groups" ADD CONSTRAINT "shared_mou_groups_administrative_project_id_projects_id_fk" FOREIGN KEY ("administrative_project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_groups" ADD CONSTRAINT "shared_mou_groups_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_membership_audits" ADD CONSTRAINT "shared_mou_membership_audits_group_id_shared_mou_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."shared_mou_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_membership_audits" ADD CONSTRAINT "shared_mou_membership_audits_membership_id_shared_mou_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."shared_mou_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_membership_audits" ADD CONSTRAINT "shared_mou_membership_audits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_membership_audits" ADD CONSTRAINT "shared_mou_membership_audits_manager_id_user_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_memberships" ADD CONSTRAINT "shared_mou_memberships_group_id_shared_mou_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."shared_mou_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_memberships" ADD CONSTRAINT "shared_mou_memberships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_memberships" ADD CONSTRAINT "shared_mou_memberships_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_memberships" ADD CONSTRAINT "shared_mou_memberships_removed_by_user_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_receipt_allocations" ADD CONSTRAINT "shared_mou_receipt_allocations_receipt_id_shared_mou_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."shared_mou_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_receipt_allocations" ADD CONSTRAINT "shared_mou_receipt_allocations_membership_id_shared_mou_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."shared_mou_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_receipt_allocations" ADD CONSTRAINT "shared_mou_receipt_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_receipt_allocations" ADD CONSTRAINT "shared_mou_receipt_allocations_funding_receipt_id_funding_receipts_id_fk" FOREIGN KEY ("funding_receipt_id") REFERENCES "public"."funding_receipts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_receipts" ADD CONSTRAINT "shared_mou_receipts_group_id_shared_mou_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."shared_mou_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_mou_receipts" ADD CONSTRAINT "shared_mou_receipts_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_mou_groups_admin_project_idx" ON "shared_mou_groups" USING btree ("administrative_project_id");--> statement-breakpoint
CREATE INDEX "shared_mou_groups_source_import_idx" ON "shared_mou_groups" USING btree ("source_import_id");--> statement-breakpoint
CREATE INDEX "shared_mou_membership_audits_group_idx" ON "shared_mou_membership_audits" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_mou_memberships_group_project_uq" ON "shared_mou_memberships" USING btree ("group_id","project_id");--> statement-breakpoint
CREATE INDEX "shared_mou_memberships_project_idx" ON "shared_mou_memberships" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "shared_mou_memberships_group_active_idx" ON "shared_mou_memberships" USING btree ("group_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_mou_receipt_allocations_receipt_project_uq" ON "shared_mou_receipt_allocations" USING btree ("receipt_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_mou_receipt_allocations_funding_receipt_uq" ON "shared_mou_receipt_allocations" USING btree ("funding_receipt_id");--> statement-breakpoint
CREATE INDEX "shared_mou_receipt_allocations_project_idx" ON "shared_mou_receipt_allocations" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_mou_receipts_payment_uq" ON "shared_mou_receipts" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "shared_mou_receipts_group_idx" ON "shared_mou_receipts" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_shared_mou_group_id_shared_mou_groups_id_fk" FOREIGN KEY ("shared_mou_group_id") REFERENCES "public"."shared_mou_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_payments" ADD CONSTRAINT "mou_payments_shared_mou_group_id_shared_mou_groups_id_fk" FOREIGN KEY ("shared_mou_group_id") REFERENCES "public"."shared_mou_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_shared_group_idx" ON "invoices" USING btree ("shared_mou_group_id");--> statement-breakpoint
CREATE INDEX "mou_payments_shared_group_idx" ON "mou_payments" USING btree ("shared_mou_group_id");--> statement-breakpoint

-- Backfill legacy multi-project schedules. Payments with the same covered
-- project set and currency become one agreement group; single-project rows are
-- intentionally left unchanged.
CREATE TEMP TABLE "_shared_mou_backfill_groups" ON COMMIT DROP AS
WITH payment_sets AS (
	SELECT
		mp.id AS payment_id,
		mp.currency,
		mp.project_id AS administrative_project_id,
		string_agg(DISTINCT mpp.project_id::text, ',' ORDER BY mpp.project_id::text) AS project_set,
		count(DISTINCT mpp.project_id) AS project_count,
		mp.amount
	FROM mou_payments mp
	JOIN mou_payment_projects mpp ON mpp.payment_id = mp.id
	GROUP BY mp.id
), grouped AS (
	SELECT
		gen_random_uuid() AS group_id,
		project_set,
		currency,
		(array_agg(administrative_project_id ORDER BY administrative_project_id::text))[1] AS administrative_project_id,
		sum(amount)::numeric(14,2) AS agreement_total
	FROM payment_sets
	WHERE project_count > 1
	GROUP BY project_set, currency
)
SELECT * FROM grouped;--> statement-breakpoint

INSERT INTO shared_mou_groups (
	id, name, counterparty, contact_email, currency, agreement_total,
	administrative_project_id, review_required, review_note
)
SELECT
	bg.group_id,
	coalesce(nullif(pbs.partner_name, ''), 'Legacy shared MoU') || ' · shared agreement',
	pbs.partner_name,
	pbs.partner_contact,
	bg.currency,
	bg.agreement_total,
	bg.administrative_project_id,
	false,
	null
FROM _shared_mou_backfill_groups bg
LEFT JOIN project_budget_settings pbs
	ON pbs.project_id = bg.administrative_project_id;--> statement-breakpoint

INSERT INTO shared_mou_memberships (
	id, group_id, project_id, allocation_amount, added_reason
)
SELECT
	gen_random_uuid(),
	bg.group_id,
	covered.project_id,
	coalesce((
		SELECT sum(bi.amount_secured)::numeric(14,2)
		FROM budget_items bi
		WHERE bi.project_id = covered.project_id
	), 0),
	'Backfilled from legacy shared payment coverage.'
FROM _shared_mou_backfill_groups bg
CROSS JOIN LATERAL unnest(string_to_array(bg.project_set, ',')::uuid[]) AS covered(project_id);--> statement-breakpoint

UPDATE shared_mou_groups g
SET
	review_required = abs(g.agreement_total - totals.allocated) > 0.005 OR totals.allocated = 0,
	review_note = CASE
		WHEN totals.allocated = 0 THEN 'Backfill could not derive project shares from secured imported budget amounts.'
		WHEN abs(g.agreement_total - totals.allocated) > 0.005 THEN 'Backfilled secured budget shares do not reconcile to the agreement total.'
		ELSE null
	END
FROM (
	SELECT group_id, coalesce(sum(allocation_amount), 0)::numeric(14,2) AS allocated
	FROM shared_mou_memberships
	GROUP BY group_id
) totals
WHERE g.id = totals.group_id
	AND g.id IN (SELECT group_id FROM _shared_mou_backfill_groups);--> statement-breakpoint

INSERT INTO shared_mou_membership_audits (
	group_id, membership_id, project_id, action, next_allocation, reason
)
SELECT
	m.group_id, m.id, m.project_id, 'backfilled', m.allocation_amount,
	'Backfilled from legacy shared payment coverage.'
FROM shared_mou_memberships m
WHERE m.group_id IN (SELECT group_id FROM _shared_mou_backfill_groups);--> statement-breakpoint

UPDATE mou_payments mp
SET shared_mou_group_id = bg.group_id
FROM (
	SELECT
		mp2.id AS payment_id,
		string_agg(DISTINCT mpp.project_id::text, ',' ORDER BY mpp.project_id::text) AS project_set,
		mp2.currency
	FROM mou_payments mp2
	JOIN mou_payment_projects mpp ON mpp.payment_id = mp2.id
	GROUP BY mp2.id
) payment_sets
JOIN _shared_mou_backfill_groups bg
	ON bg.project_set = payment_sets.project_set
	AND bg.currency = payment_sets.currency
WHERE mp.id = payment_sets.payment_id;--> statement-breakpoint

UPDATE invoices i
SET shared_mou_group_id = mp.shared_mou_group_id
FROM mou_payments mp
WHERE i.mou_payment_id = mp.id
	AND mp.shared_mou_group_id IS NOT NULL;--> statement-breakpoint

-- Convert legacy paid rows into one group receipt plus exact project-ledger
-- allocations without changing the total funding recorded.
CREATE TEMP TABLE "_shared_mou_backfill_receipts" ON COMMIT DROP AS
SELECT
	gen_random_uuid() AS receipt_id,
	mp.id AS payment_id,
	mp.shared_mou_group_id AS group_id,
	mp.project_id AS administrative_project_id,
	mp.receipt_id AS legacy_funding_receipt_id,
	mp.amount,
	mp.currency,
	coalesce(fr.received_date, mp.due_date) AS received_date,
	fr.source,
	fr.note,
	fr.recorded_by
FROM mou_payments mp
LEFT JOIN funding_receipts fr ON fr.id = mp.receipt_id
WHERE mp.shared_mou_group_id IS NOT NULL
	AND mp.paid_at IS NOT NULL;--> statement-breakpoint

INSERT INTO shared_mou_receipts (
	id, group_id, payment_id, amount, currency, received_date, source, note, recorded_by
)
SELECT
	receipt_id, group_id, payment_id, amount, currency, received_date,
	coalesce(source, 'Legacy shared MoU receipt'), note, recorded_by
FROM _shared_mou_backfill_receipts;--> statement-breakpoint

CREATE TEMP TABLE "_shared_mou_backfill_allocations" ON COMMIT DROP AS
WITH weights AS (
	SELECT
		r.*,
		m.id AS membership_id,
		m.project_id,
		round(m.allocation_amount * 100)::bigint AS weight_cents,
		round(r.amount * 100)::bigint AS received_cents,
		sum(round(m.allocation_amount * 100)::bigint) OVER (PARTITION BY r.payment_id) AS total_weight
	FROM _shared_mou_backfill_receipts r
	JOIN shared_mou_memberships m ON m.group_id = r.group_id AND m.active
), bases AS (
	SELECT
		*,
		CASE
			WHEN total_weight = 0 THEN CASE WHEN project_id = administrative_project_id THEN received_cents ELSE 0 END
			ELSE floor(received_cents::numeric * weight_cents / total_weight)::bigint
		END AS base_cents,
		CASE
			WHEN total_weight = 0 THEN 0::numeric
			ELSE (received_cents::numeric * weight_cents / total_weight)
				- floor(received_cents::numeric * weight_cents / total_weight)
		END AS fraction
	FROM weights
), ranked AS (
	SELECT
		*,
		received_cents - sum(base_cents) OVER (PARTITION BY payment_id) AS residue,
		row_number() OVER (PARTITION BY payment_id ORDER BY fraction DESC, project_id::text) AS residue_rank
	FROM bases
)
SELECT
	receipt_id,
	membership_id,
	project_id,
	CASE
		WHEN project_id = administrative_project_id AND legacy_funding_receipt_id IS NOT NULL
			THEN legacy_funding_receipt_id
		ELSE gen_random_uuid()
	END AS funding_receipt_id,
	((base_cents + CASE WHEN residue_rank <= residue THEN 1 ELSE 0 END)::numeric / 100)::numeric(14,2) AS allocation_amount,
	legacy_funding_receipt_id,
	administrative_project_id,
	currency,
	received_date,
	source,
	recorded_by,
	group_id
FROM ranked;--> statement-breakpoint

UPDATE funding_receipts fr
SET
	amount = a.allocation_amount,
	note = 'Allocated from a backfilled shared MoU receipt.',
	updated_at = now()
FROM _shared_mou_backfill_allocations a
WHERE fr.id = a.funding_receipt_id
	AND a.funding_receipt_id = a.legacy_funding_receipt_id;--> statement-breakpoint

INSERT INTO funding_receipts (
	id, project_id, amount, currency, received_date, source, note, recorded_by
)
SELECT
	funding_receipt_id, project_id, allocation_amount, currency, received_date,
	coalesce(source, 'Legacy shared MoU receipt'),
	'Allocated from a backfilled shared MoU receipt.', recorded_by
FROM _shared_mou_backfill_allocations
WHERE legacy_funding_receipt_id IS NULL
	OR funding_receipt_id <> legacy_funding_receipt_id;--> statement-breakpoint

INSERT INTO shared_mou_receipt_allocations (
	receipt_id, membership_id, project_id, funding_receipt_id, amount
)
SELECT receipt_id, membership_id, project_id, funding_receipt_id, allocation_amount
FROM _shared_mou_backfill_allocations;--> statement-breakpoint

UPDATE mou_payments
SET
	readiness_status = CASE WHEN paid_at IS NOT NULL THEN 'received' ELSE 'locked' END,
	readiness_reason = CASE WHEN paid_at IS NOT NULL THEN 'Payment received.' ELSE 'Readiness will be evaluated after migration.' END,
	readiness_evaluated_at = now()
WHERE shared_mou_group_id IS NOT NULL;
