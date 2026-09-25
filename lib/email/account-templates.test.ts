import { describe, expect, it } from "vitest";

import { renderInviteEmail } from "./invite";
import { renderMagicLinkEmail } from "./magic-link";
import { renderPasswordResetEmail } from "./password-reset";
import { renderWorkflowEmail } from "./workflow-notification";
import { renderSecurityAlertEmail } from "./security-alert";

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

  it("uses a defensive workspace fallback when invitation identity is missing", () => {
    const rendered = renderInviteEmail({
      inviteUrl: "https://sastra.test/invite/token",
      role: "member",
    });
    expect(rendered.subject).toBe("You’re invited to your Sastra workspace");
    expect(rendered.html).toContain("Join your Sastra workspace");
  });

  it("renders super-admin invitations without exposing the storage slug", () => {
    const rendered = renderInviteEmail({
      inviteUrl: "https://sastra.test/invite/token",
      role: "super_admin",
      workspaceName: "Example Org",
    });
    expect(rendered.html).toContain("super admin");
    expect(rendered.text).toContain("super admin");
    expect(rendered.html).not.toContain("super_admin");
  });

  it("states the exact magic-link lifetime and one-use behavior", () => {
    const rendered = renderMagicLinkEmail({
      url: "https://sastra.test/magic?token=x&next=/dashboard",
      workspaceName: "Example Org",
    });
    expect(rendered.subject).toBe("Sign in to Sastra");
    expect(rendered.html).toContain("This link expires in 5 minutes and can be used once.");
    expect(rendered.html).toContain(">Sign in to Sastra<");
    expect(rendered.text).toContain("https://sastra.test/magic?token=x&next=/dashboard");
  });

  it("states the one-hour password-reset lifetime", () => {
    const rendered = renderPasswordResetEmail({
      url: "https://sastra.test/reset/token",
      workspaceName: "Example Org",
    });
    expect(rendered.subject).toBe("Reset your Sastra password");
    expect(rendered.html).toContain("This link expires in one hour.");
    expect(rendered.html).toContain(">Reset password<");
    expect(rendered.text).toContain("ignore this email");
  });

  it("uses the accessible shared presentation and a specific workflow action", () => {
    const rendered = renderWorkflowEmail({
      title: "Review the current quotation",
      body: "Approval is due tomorrow.",
      project: "The <Trinity>",
      url: "https://sastra.test/projects/trinity/budget",
      actionLabel: "Review budget",
      unsubscribeToken: "token",
      workspaceName: "Example Org",
    });
    expect(rendered.html).toContain('<html lang="en">');
    expect(rendered.html).toContain('width="560"');
    expect(rendered.html).toContain("email-preheader");
    expect(rendered.html).toContain("The &lt;Trinity&gt;");
    expect(rendered.html).toContain(">Review budget<");
    expect(rendered.text).toContain("Manage notification settings");
    expect(rendered.text).toContain("Stop workflow emails");
  });

  it("makes dependency alerts explicit and super-admin scoped", () => {
    const failed = renderSecurityAlertEmail({
      kind: "failed",
      workspaceName: "Example Org",
    });
    expect(failed.subject).toContain("security check failed");
    expect(failed.text).toContain("high-severity");
    expect(failed.text).toContain("only to active super administrators");

    const stale = renderSecurityAlertEmail({
      kind: "stale",
      workspaceName: "Example Org",
    });
    expect(stale.subject).toContain("overdue");
    expect(stale.text).toContain("scheduled GitHub Action");

    const databaseTls = renderSecurityAlertEmail({
      kind: "database_tls",
      workspaceName: "Example Org",
    });
    expect(databaseTls.subject).toContain("not encrypted");
    expect(databaseTls.text).toContain("verify-full");
  });
});
