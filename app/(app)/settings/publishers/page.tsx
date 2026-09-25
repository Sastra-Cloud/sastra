import { requireRole } from "@/lib/auth/guards";
import {
  listHoldersWithContacts,
  listHolderUsage,
} from "@/lib/rights/queries";
import { PublishersManager } from "@/components/settings/publishers-manager";

export const metadata = { title: "Publishers" };
export const dynamic = "force-dynamic";

export default async function PublishersSettingsPage() {
  await requireRole("manager");
  const [{ holders, contacts }, usage] = await Promise.all([
    listHoldersWithContacts(),
    listHolderUsage(),
  ]);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <a
          href="/api/reports/rights"
          className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/40"
          download
        >
          Export rights report (.xlsx)
        </a>
      </div>
      <PublishersManager
        holders={holders.map((h) => ({
          id: h.id,
          name: h.name,
          website: h.website,
          notes: h.notes,
          projectCount:
            usage.find((row) => row.holderId === h.id)?.projectCount ?? 0,
          threadCount:
            usage.find((row) => row.holderId === h.id)?.threadCount ?? 0,
        }))}
        contacts={contacts.map((c) => ({
          id: c.id,
          holderId: c.holderId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          role: c.role,
        }))}
      />
    </div>
  );
}
