import { listDictionaryTerms } from "@/lib/dictionary/actions";
import { DictionaryManager } from "@/components/settings/dictionary-manager";

export const metadata = { title: "Voice dictionary" };
export const dynamic = "force-dynamic";

export default async function DictionarySettingsPage() {
  const terms = await listDictionaryTerms();
  return <DictionaryManager terms={terms} />;
}
