import { requireUser } from "@/lib/auth/guards";
import { isAutoStartEnabled } from "@/lib/tasks/time-service";
import { ProfileForm } from "@/components/settings/profile-form";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { AutoTimerToggle } from "@/components/settings/auto-timer-toggle";
import { GuidanceToggle } from "@/components/settings/guidance-toggle";

export const metadata = { title: "Profile settings" };
export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const { user } = await requireUser();
  const autoStartTimer = await isAutoStartEnabled(user.id);
  const guidanceEnabled =
    (user as { guidanceLevel?: string }).guidanceLevel !== "off";
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium">Profile photo</p>
        <AvatarUploader name={user.name} image={user.image ?? null} />
      </div>
      <ProfileForm
        defaultName={user.name}
        defaultTimezone={user.timezone ?? "UTC"}
      />
      <div className="space-y-3 border-t pt-6">
        <p className="text-sm font-medium">Guidance</p>
        <GuidanceToggle defaultEnabled={guidanceEnabled} />
      </div>
      <div className="space-y-3 border-t pt-6">
        <p className="text-sm font-medium">Time tracking</p>
        <AutoTimerToggle defaultEnabled={autoStartTimer} />
      </div>
    </div>
  );
}
