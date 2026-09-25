"use client";

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { usePresence } from "@/components/presence/presence-provider";
import { avatarSrc, initials } from "@/lib/users/avatar";
import { cn } from "@/lib/utils";

/**
 * A user's avatar: their uploaded image with an initials fallback. The base-ui
 * Avatar automatically shows the fallback while the image loads or if it fails.
 * Pass `userId` + `showPresence` to overlay a live online/away status dot.
 */
export function UserAvatar({
  name,
  image,
  size = "default",
  className,
  userId,
  showPresence = false,
}: {
  name: string;
  image?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
  userId?: string | null;
  showPresence?: boolean;
}) {
  const src = avatarSrc(image);
  return (
    <Avatar size={size} className={className}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
      {showPresence && userId ? <PresenceDot userId={userId} /> : null}
    </Avatar>
  );
}

function PresenceDot({ userId }: { userId: string }) {
  const status = usePresence(userId);
  if (status === "offline") return null;
  return (
    <AvatarBadge
      aria-label={status === "online" ? "Online" : "Away"}
      className={cn(status === "online" ? "bg-success" : "bg-warning")}
    />
  );
}
