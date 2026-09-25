"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Trash2 } from "lucide-react";

import {
  readFileAsDataURL,
  validateImageFile,
} from "@/lib/files/crop-image";
import { setProfileImage } from "@/lib/team/actions";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AvatarCropDialog } from "@/components/settings/avatar-crop-dialog";

export function AvatarUploader({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, startRemove] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    try {
      setCropSrc(await readFileAsDataURL(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that image");
    }
  }

  async function onCropped(file: File) {
    setSaving(true);
    try {
      await setProfileImage(await readFileAsDataURL(file));
      toast.success("Profile photo updated");
      setCropSrc(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update photo");
    } finally {
      setSaving(false);
    }
  }

  function onRemove() {
    startRemove(async () => {
      try {
        await setProfileImage(null);
        toast.success("Profile photo removed");
        router.refresh();
      } catch {
        toast.error("Couldn't remove photo");
      }
    });
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar name={name} image={image} size="lg" className="size-16" />
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={onPick}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || removing}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="size-4" />
            {image ? "Change photo" : "Upload photo"}
          </Button>
          {image ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving || removing}
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
              {removing ? "Removing…" : "Remove"}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, or WebP. You can crop and zoom before saving.
        </p>
      </div>

      <AvatarCropDialog
        open={cropSrc !== null}
        src={cropSrc}
        busy={saving}
        onCancel={() => setCropSrc(null)}
        onCropped={onCropped}
      />
    </div>
  );
}
