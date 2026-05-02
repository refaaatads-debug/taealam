import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
  aspect?: number;
}

// Output size targets per aspect to keep all cards visually consistent
const OUTPUT_SIZES: { ratio: number; w: number; h: number }[] = [
  { ratio: 1, w: 800, h: 800 },
  { ratio: 3 / 4, w: 720, h: 960 },
  { ratio: 4 / 3, w: 960, h: 720 },
  { ratio: 16 / 9, w: 1280, h: 720 },
];

function targetSize(aspect: number) {
  const match = OUTPUT_SIZES.find((o) => Math.abs(o.ratio - aspect) < 0.01);
  if (match) return { w: match.w, h: match.h };
  // Fallback: normalize longest side to 1024
  if (aspect >= 1) return { w: 1024, h: Math.round(1024 / aspect) };
  return { w: Math.round(1024 * aspect), h: 1024 };
}

async function getCroppedBlob(imageSrc: string, area: Area, aspect: number): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imageSrc;
  });
  const { w, h } = targetSize(aspect);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Draw cropped region scaled to fixed output dimensions
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
}

export default function ImageCropDialog({ open, imageSrc, onCancel, onCropped, aspect = 1 }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [aspectRatio, setAspectRatio] = useState(aspect);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setAreaPx(pixels), []);

  const handleSave = async () => {
    if (!imageSrc || !areaPx) return;
    const blob = await getCroppedBlob(imageSrc, areaPx);
    onCropped(blob);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>قص الصورة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative w-full h-[400px] bg-muted rounded-lg overflow-hidden">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspectRatio}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Label className="w-full">نسبة العرض/الارتفاع:</Label>
            {[
              { l: "مربع 1:1", v: 1 },
              { l: "بورتريه 3:4", v: 3 / 4 },
              { l: "أفقي 4:3", v: 4 / 3 },
              { l: "عريض 16:9", v: 16 / 9 },
            ].map((o) => (
              <Button
                key={o.l}
                size="sm"
                variant={aspectRatio === o.v ? "default" : "outline"}
                onClick={() => setAspectRatio(o.v)}
              >
                {o.l}
              </Button>
            ))}
          </div>
          <div>
            <Label>تكبير: {zoom.toFixed(2)}x</Label>
            <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>إلغاء</Button>
          <Button onClick={handleSave}>قص ورفع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
