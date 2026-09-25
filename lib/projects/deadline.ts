export type PortfolioDeadlineInput = {
  dueDate: string | null;
  completeByDate?: string | null;
  activeReprintStatus?: string | null;
  activeReprintDueDate?: string | null;
};

/**
 * The deadline used to order current portfolio work.
 *
 * An active reprint is its own current work item, so its campaign deadline
 * replaces the publication deadline. Otherwise a signed rights agreement's
 * complete-by date is contractual and takes precedence over the project's
 * fallback due date.
 */
export function portfolioDeadline(project: PortfolioDeadlineInput) {
  if (project.activeReprintStatus) {
    return project.activeReprintDueDate ?? null;
  }

  return project.completeByDate ?? project.dueDate;
}
