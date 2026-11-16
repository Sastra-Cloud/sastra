import { describe, expect, it } from "vitest";

import { renderInviteEmail } from "./invite";
import { renderMagicLinkEmail } from "./magic-link";
import { renderPasswordResetEmail } from "./password-reset";
import { renderWorkflowEmail } from "./workflow-notification";
import { renderSecurityAlertEmail } from "./security-alert";
import { renderSecurityCodeEmail } from "./security-code";

describe("account email templates", () => {
  it("renders an organization-aware invitation with escaped values and text parity", () => {
    const rendered = renderInviteEmail({
      inviteUrl: "https://sastra.test/invite/a&b",
      role: "manager",
      invitedByName: "Sam <Admin>",
      workspaceName: "Sastra & Co",
    });
    expect(rendered.subject).toBe("Sam <Admin> invited you to Sastra & Co");
    expect(rendered.html).toContain("Join Sastra &amp; Co");
    expect(rendered.html).toContain("Sam &lt;Admin&gt;");
    expect(rendered.html).not.toContain("Sam <Admin>");
    expect(rendered.html).toContain("Accept invitation");
    expect(rendered.html).toContain("expires in seven days");
    expect(rendered.text).toContain("https://sastra.test/invite/a&b");
    expect(rendered.text).toContain("ignore this email");
  });

  it("escapes the project name while preserving the workflow destination", () => {
    const rendered = renderWorkflowEmail({
      title: "Review the current quotation",
      body: "Approval is due tomorrow.",
      project: "The <Trinity>",
      url: "https://sastra.test/projects/trinity/budget",
      actionLabel: "Review budget",
      unsubscribeToken: "token",
      workspaceName: "Example Org",
    });
    expect(rendered.html).toContain("The &lt;Trinity&gt;");
    expect(rendered.html).toContain('href="https://sastra.test/projects/trinity/budget"');
    expect(rendered.subject).toBe("The <Trinity> · Review the current quotation");
    expect(rendered.text).toContain("Manage notification settings");
    expect(rendered.text).toContain("Stop workflow emails");
  });

  it("escapes the workspace identity in every transactional template", () => {
    const workspaceName = "Example <Publishing>";
    const examples = [
      renderInviteEmail({ inviteUrl: "https://sastra.test/invite", role: "member", workspaceName }),
      renderMagicLinkEmail({ url: "https://sastra.test/sign-in", workspaceName }),
      renderPasswordResetEmail({ url: "https://sastra.test/reset", workspaceName }),
      renderSecurityCodeEmail({ code: "123456", workspaceName }),
      ...(["failed", "stale", "database_tls"] as const).map((kind) => renderSecurityAlertEmail({ kind, workspaceName })),
      renderWorkflowEmail({ title: "Review budget", project: "The Trinity", url: "https://sastra.test/projects/trinity/budget", actionLabel: "Review budget", unsubscribeToken: "t", workspaceName }),
    ];
    for (const email of examples) {
      expect(email.html).toContain("Example &lt;Publishing&gt;");
      expect(email.html).not.toContain("Example <Publishing>");
      expect(email.text).toContain(workspaceName);
    }
  });
});
