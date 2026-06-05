import type { CompressedImage } from "../types";
import { T } from "../lib/constants";

interface ImagePreviewProps {
  images: CompressedImage[];
  onRemove: (index: number) => void;
}

export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (!images.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      {images.map((img, i) => (
        <div key={i} style={{ position: "relative" }}>
          <img
            src={img.dataUrl}
            alt=""
            style={{
              width: 72,
              height: 72,
              objectFit: "cover",
              borderRadius: 8,
              border: `1px solid ${T.border}`,
            }}
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: T.danger,
              color: "#fff",
              border: "none",
              fontSize: 11,
              cursor: "pointer",
              lineHeight: "20px",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
          {img.barcode && (
            <div
              style={{
                position: "absolute",
                bottom: 2,
                left: 2,
                right: 2,
                background: "rgba(0,0,0,.7)",
                color: "#fff",
                fontSize: 8,
                padding: "1px 3px",
                borderRadius: 4,
                textAlign: "center",
                fontFamily: T.mono,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {img.barcode}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
