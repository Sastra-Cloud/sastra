import { redirect } from "next/navigation";

export const metadata = { title: "Agenda" };

export default function AgendaPage() {
  redirect("/tasks?view=agenda");
}
