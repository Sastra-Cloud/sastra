import { formatDate } from "@/lib/format";

export function dueDateChangeBody(title: string, dueDate: string | null): string {
  void title;
  return dueDate
    ? `Now due ${formatDate(dueDate)}`
    : "No due date";
}

export function overdueTaskBody(title: string, dueDate: string): string {
  void title;
  return `Was due ${formatDate(dueDate)}`;
}
