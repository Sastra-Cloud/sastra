"use client";

import { uploadFile } from "@/lib/files/upload-client";
import { FieldError, FieldErrorsContext } from "./field-errors";
import { useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  FileText,
  Gauge,
  Languages,
  Loader2,
  Save,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TimezoneControl } from "./timezone-control";
import { Label } from "@/components/ui/label";
import { updateWorkspaceSettings } from "@/lib/workspace/actions";
import type { WorkspaceSettings } from "@/lib/workspace/queries";
import { CapacityGroupsEditor } from "@/components/settings/capacity-groups-editor";
import { DEFAULT_CAPACITY_GROUPS, normalizeGroups, type CapacityGroup } from "@/lib/planning/groups";

const selectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const textareaClass = "min-h-24 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function timeToMinutes(value: FormDataEntryValue | null) {
  const [hours, minutes] = String(value ?? "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function Field({ label, name, defaultValue, placeholder, type = "text" }: { label: string; name: string; defaultValue?: string | number | null; placeholder?: string; type?: string }) {
  const errors = useContext(FieldErrorsContext);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${name}-error` : undefined} id={name} name={name} type={type} step={type === "number" ? "any" : undefined} defaultValue={defaultValue ?? ""} placeholder={placeholder} />
      <FieldError name={name} />
    </div>
  );
}

export function WorkspaceSettingsForm({ settings }: { settings: WorkspaceSettings }) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [invoiceLogo, setInvoiceLogo] = useState(settings.invoicePaymentDetails?.logoFileId ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <FieldErrorsContext.Provider value={fieldErrors}>
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const number = (name: string) => Number(form.get(name));
        let capacityGroups: CapacityGroup[] | undefined;
        try {
          const raw = form.get("capacityGroups");
          if (raw) capacityGroups = JSON.parse(String(raw)) as CapacityGroup[];
        } catch {
          capacityGroups = undefined;
        }
        startTransition(async () => {
          try {
          const res = await updateWorkspaceSettings({
            legalName: String(form.get("legalName") ?? ""),
            timezone: String(form.get("timezone") ?? "UTC"),
            sourceLanguage: String(form.get("sourceLanguage") ?? ""),
            targetLanguage: String(form.get("targetLanguage") ?? ""),
            defaultTerritory: String(form.get("defaultTerritory") ?? ""),
            defaultCurrency: String(form.get("defaultCurrency") ?? "USD").toUpperCase(),
            missionContext: String(form.get("missionContext") ?? ""),
            contactEmail: String(form.get("contactEmail") ?? ""),
            contactPhone: String(form.get("contactPhone") ?? ""),
            addressLine1: String(form.get("addressLine1") ?? ""),
            addressLine2: String(form.get("addressLine2") ?? ""),
            addressCity: String(form.get("addressCity") ?? ""),
            addressRegion: String(form.get("addressRegion") ?? ""),
            addressPostalCode: String(form.get("addressPostalCode") ?? ""),
            addressCountry: String(form.get("addressCountry") ?? ""),
            registrationNumber: String(form.get("registrationNumber") ?? ""),
            taxId: String(form.get("taxId") ?? ""),
            paymentInstructions: String(form.get("paymentInstructions") ?? ""),
            invoicePaymentDetails: {
              issuerName: String(form.get("invoiceIssuerName") ?? ""),
              logoFileId: invoiceLogo,
              title: String(form.get("invoicePaymentTitle") ?? ""),
              fields: String(form.get("invoicePaymentFields") ?? "").split("\n").filter((line) => line.trim()).map((line) => {
                const separator = line.indexOf(":");
                return { label: separator < 0 ? line.trim() : line.slice(0, separator).trim(), value: separator < 0 ? "" : line.slice(separator + 1).trim() };
              }),
            },
            workDays: form.getAll("workDays").map(Number),
            workHoursStart: timeToMinutes(form.get("workHoursStart")),
            workHoursEnd: timeToMinutes(form.get("workHoursEnd")),
            weeklyDigestDay: number("weeklyDigestDay"),
            weeklyDigestTime: String(form.get("weeklyDigestTime") ?? "09:00"),
            externalFollowUpBusinessDays: number("externalFollowUpBusinessDays"),
            wordsPerPage: number("wordsPerPage"),
            languageExpansionFactor: number("languageExpansionFactor"),
            trimWidthIn: number("trimWidthIn"),
            trimHeightIn: number("trimHeightIn"),
            defaultDeliveryLocation: String(form.get("defaultDeliveryLocation") ?? ""),
            financialEmail: String(form.get("financialEmail") ?? ""),
            defaultCcEmails: String(form.get("defaultCcEmails") ?? "")
              .split(/[,\n;]/)
              .map((value) => value.trim())
              .filter(Boolean),
            fundingAccountLabel: String(form.get("fundingAccountLabel") ?? ""),
            defaultFundingDeductionPercent: number("defaultFundingDeductionPercent"),
            rateTranslation: number("rateTranslation"),
            rateProofreading: number("rateProofreading"),
            rateEditing: number("rateEditing"),
            rateCoverDesign: number("rateCoverDesign"),
            rateTypesetting: number("rateTypesetting"),
            rateProjectManagement: number("rateProjectManagement"),
            ratePrintShip: number("ratePrintShip"),
            rateAudiobook: number("rateAudiobook"),
            rateVideoSeries: number("rateVideoSeries"),
            capacityGroups,
            durationMonthsBook: number("durationMonthsBook"),
            durationMonthsArticle: number("durationMonthsArticle"),
            durationMonthsPodcast: number("durationMonthsPodcast"),
            durationMonthsVideoSeries: number("durationMonthsVideoSeries"),
            durationMonthsOther: number("durationMonthsOther"),
          }, { completeSetup: true });
          setFieldErrors(res.fieldErrors ?? {});
          if (res.error) {
            toast.error(res.error);
            return;
          }
          toast.success("Workspace defaults saved");
          router.refresh();
          } catch { toast.error("Could not save workspace settings. Your changes are still here; try again."); }
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Languages className="size-4" />Language, locale, and schedule</CardTitle>
          <CardDescription>Defaults for new people, projects, standups, and scheduled summaries. Existing overrides stay unchanged.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal organization name" name="legalName" defaultValue={settings.legalName} />
          <div className="grid gap-1.5"><Label htmlFor="timezone">Workspace timezone</Label><TimezoneControl id="timezone" defaultValue={settings.timezone} /><FieldError name="timezone" /></div>
          <Field label="Primary source language" name="sourceLanguage" defaultValue={settings.sourceLanguage} />
          <Field label="Primary target language" name="targetLanguage" defaultValue={settings.targetLanguage} />
          <Field label="Default territory" name="defaultTerritory" defaultValue={settings.defaultTerritory} />
          <Field label="Default currency" name="defaultCurrency" defaultValue={settings.defaultCurrency} />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Work days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day, index) => (
                <label key={day} className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm">
                  <input type="checkbox" name="workDays" value={index} defaultChecked={settings.workDays.includes(index)} />{day}
                </label>
              ))}
            </div>
          </div>
          <Field label="Work day starts" name="workHoursStart" type="time" defaultValue={minutesToTime(settings.workHoursStart)} />
          <Field label="Work day ends" name="workHoursEnd" type="time" defaultValue={minutesToTime(settings.workHoursEnd)} />
          <div className="grid gap-1.5">
            <Label htmlFor="weeklyDigestDay">Weekly digest day</Label>
            <select id="weeklyDigestDay" name="weeklyDigestDay" className={selectClass} defaultValue={settings.weeklyDigestDay}>
              {DAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </div>
          <Field label="Weekly digest time" name="weeklyDigestTime" type="time" defaultValue={settings.weeklyDigestTime} />
          <div className="grid gap-1.5 sm:col-span-2">
            <Field
              label="External email follow-up (business days)"
              name="externalFollowUpBusinessDays"
              type="number"
              defaultValue={settings.externalFollowUpBusinessDays}
            />
            <p className="text-xs text-muted-foreground">
              Remind the responsible manager when a project-linked outbound email has no reply.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="size-4" />Publishing, budget, and print defaults</CardTitle>
          <CardDescription>Copied into new project settings. Project teams can then override them without changing the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Words per page" name="wordsPerPage" type="number" defaultValue={settings.wordsPerPage} />
          <Field label="Target-language expansion factor" name="languageExpansionFactor" type="number" defaultValue={settings.languageExpansionFactor} />
          <Field label="Default delivery location" name="defaultDeliveryLocation" defaultValue={settings.defaultDeliveryLocation} />
          <Field label="Trim width (in)" name="trimWidthIn" type="number" defaultValue={settings.trimWidthIn} />
          <Field label="Trim height (in)" name="trimHeightIn" type="number" defaultValue={settings.trimHeightIn} />
          <Field label="Finance recipient" name="financialEmail" type="email" defaultValue={settings.financialEmail} />
          <div
            id="outbound-email-defaults"
            className="grid scroll-mt-24 gap-1.5 sm:col-span-2 lg:col-span-3"
          >
            <Label htmlFor="defaultCcEmails">
              Default CC recipients for outbound email
            </Label>
            <Input
              aria-describedby="defaultCcEmails-error" id="defaultCcEmails"
              name="defaultCcEmails"
              defaultValue={settings.defaultCcEmails.join(", ")}
              placeholder="Separate email addresses with commas"
            /><FieldError name="defaultCcEmails" />
            <p className="text-xs text-muted-foreground">
              Added to every new proposal, invoice, printer quote request, finance
              request, correspondence reply, and assistant email draft. The
              sender can edit or remove recipients before sending.
            </p>
          </div>
          <Field label="Funding/account label" name="fundingAccountLabel" defaultValue={settings.fundingAccountLabel} />
          <div className="grid gap-1.5">
            <Field
              label="Default organization donation fee (%)"
              name="defaultFundingDeductionPercent"
              type="number"
              defaultValue={(settings.defaultFundingDeductionBps / 100).toFixed(2)}
            />
            <p className="text-xs text-muted-foreground">
              New project and reprint budgets snapshot this rate. Existing budgets stay unchanged until enabled.
            </p>
          </div>
          {[
            ["Translation rate", "rateTranslation", settings.rateTranslation],
            ["Proofreading rate", "rateProofreading", settings.rateProofreading],
            ["Editing rate", "rateEditing", settings.rateEditing],
            ["Cover design rate", "rateCoverDesign", settings.rateCoverDesign],
            ["Typesetting rate", "rateTypesetting", settings.rateTypesetting],
            ["Project management rate", "rateProjectManagement", settings.rateProjectManagement],
            ["Print & shipping rate", "ratePrintShip", settings.ratePrintShip],
            ["Audiobook rate", "rateAudiobook", settings.rateAudiobook],
            ["Video series rate", "rateVideoSeries", settings.rateVideoSeries],
          ].map(([label, name, value]) => <Field key={String(name)} label={String(label)} name={String(name)} type="number" defaultValue={String(value)} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Gauge className="size-4" />Planning capacity</CardTitle>
          <CardDescription>Group project types into <strong>work paths</strong> that run in parallel, each with its own &ldquo;how many at once.&rdquo; Books are typically their own path; articles, podcasts, and video series share one because they use the same creative staff. Duration stays per project type. These drive the completion-date planner and the Schedule roadmap; adjust them as real completion data accrues.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-1.5">
            <Label>Work paths &amp; concurrency</Label>
            <CapacityGroupsEditor
              defaultGroups={
                normalizeGroups(
                  (settings.capacityGroups as CapacityGroup[] | null | undefined)?.length
                    ? (settings.capacityGroups as CapacityGroup[])
                    : DEFAULT_CAPACITY_GROUPS
                )
              }
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Typical duration per project type</Label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Book (months)", "durationMonthsBook", settings.durationMonthsBook],
                ["Article collection (months)", "durationMonthsArticle", settings.durationMonthsArticle],
                ["Podcast series (months)", "durationMonthsPodcast", settings.durationMonthsPodcast],
                ["Video series (months)", "durationMonthsVideoSeries", settings.durationMonthsVideoSeries],
                ["Other (months)", "durationMonthsOther", settings.durationMonthsOther],
              ].map(([label, name, value]) => <Field key={String(name)} label={String(label)} name={String(name)} type="number" defaultValue={String(value)} />)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="invoice-issuer" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="size-4" />Invoice issuer</CardTitle>
          <CardDescription>Public details are snapshotted when an invoice is generated, so historical invoices remain stable.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Field label="Invoice issuer name" name="invoiceIssuerName" defaultValue={settings.invoicePaymentDetails?.issuerName} placeholder={settings.legalName || settings.orgName || "Name shown on invoices"} />
            <p className="text-xs text-muted-foreground">Use a different name for invoices if needed. Leave blank to use the legal organization name, or organization name. This does not change workspace branding.</p>
          </div>
          <Field label="Public contact email" name="contactEmail" type="email" defaultValue={settings.contactEmail} />
          <Field label="Public contact phone" name="contactPhone" defaultValue={settings.contactPhone} />
          <Field label="Address line 1" name="addressLine1" defaultValue={settings.addressLine1} />
          <Field label="Address line 2" name="addressLine2" defaultValue={settings.addressLine2} />
          <Field label="City" name="addressCity" defaultValue={settings.addressCity} />
          <Field label="State / province" name="addressRegion" defaultValue={settings.addressRegion} />
          <Field label="Postal code" name="addressPostalCode" defaultValue={settings.addressPostalCode} />
          <Field label="Country" name="addressCountry" defaultValue={settings.addressCountry} />
          <Field label="Registration number" name="registrationNumber" defaultValue={settings.registrationNumber} />
          <Field label="Tax ID" name="taxId" defaultValue={settings.taxId} />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="invoiceLogo">Invoice logo (optional)</Label>
            {invoiceLogo && <a className="text-sm text-primary underline" href={`/api/files/${invoiceLogo}/download?inline=1`} target="_blank" rel="noreferrer">Preview invoice logo</a>}
            <Input id="invoiceLogo" type="file" accept="image/png,image/jpeg" disabled={uploadingLogo} onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setUploadingLogo(true);
              try { const id = await uploadFile(file); if (id) setInvoiceLogo(id); }
              finally { setUploadingLogo(false); }
            }} />
            <p className="text-xs text-muted-foreground">{uploadingLogo ? "Uploading invoice logo…" : "Save workspace settings to apply this logo to new invoices. Workspace branding is unchanged."}</p>
            <Label htmlFor="invoicePaymentTitle">Payment request heading</Label>
            <Input aria-describedby="invoicePaymentTitle-error" id="invoicePaymentTitle" name="invoicePaymentTitle" defaultValue={settings.invoicePaymentDetails?.title ?? ""} placeholder="For example, ACH Payment Request" /><FieldError name="invoicePaymentTitle" />
            <Label htmlFor="invoicePaymentFields">Payee and bank details</Label>
            <textarea id="invoicePaymentFields" name="invoicePaymentFields" rows={10} className={textareaClass}
              defaultValue={settings.invoicePaymentDetails?.fields.map((field) => `${field.label}: ${field.value}`).join("\n") ?? ""}
              placeholder={"Payable to: \nPayee address: \nBank name: \nBank address: \nRouting number: \nAccount number: \nAccount type: \nFor further credit to: "} />
            <p className="text-xs text-muted-foreground">One label: value per line. These details appear in a payment table on new invoice PDFs. Leave unused rows out. Account numbers are stored as text, preserving leading zeros.</p>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="paymentInstructions">Payment instructions</Label>
            <textarea id="paymentInstructions" name="paymentInstructions" className={textareaClass} defaultValue={settings.paymentInstructions ?? ""} placeholder="Payment currency, transfer instructions, advice email, and required fund designation" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="size-4" />AI organization context</CardTitle>
          <CardDescription>Trusted context used to distinguish your team from external partners, rights holders, and printers.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-1.5">
            <Label htmlFor="missionContext">Mission and publishing context</Label>
            <textarea id="missionContext" name="missionContext" className={textareaClass} defaultValue={settings.missionContext ?? ""} placeholder="Describe your organization, publishing focus, audiences, and the kinds of work you produce." />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end pr-14">
        <Button type="submit" size="lg" disabled={pending || uploadingLogo} className="shadow-lg">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "Saving defaults…" : "Save workspace defaults"}
        </Button>
      </div>
    </form>
    </FieldErrorsContext.Provider>
  );
}
