"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cropToFile, type PixelCrop } from "@/lib/files/crop-image";

export function AvatarCropDialog({
  open,
  src,
  busy = false,
  onCancel,
  onCropped,
}: {
  open: boolean;
  src: string | null;
  busy?: boolean;
  onCancel: () => void;
  onCropped: (file: File) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<PixelCrop | null>(null);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setAreaPixels(pixels);
  }, []);

  async function apply() {
    if (!src || !areaPixels) return;
    const file = await cropToFile(src, areaPixels);
    onCropped(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop photo</DialogTitle>
          <DialogDescription>
            Drag to reposition and use the slider to zoom.
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-64 w-full overflow-hidden rounded-lg bg-muted">
          {src ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-primary"
            aria-label="Zoom"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy || !areaPixels}>
            {busy ? "Saving…" : "Save photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
