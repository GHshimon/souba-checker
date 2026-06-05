import { useCallback, useEffect, useRef, useState } from "react";
import { T, btnStyle } from "../lib/constants";

interface DropZoneProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
}

export function DropZone({ onFiles, multiple = true }: DropZoneProps) {
  const [drag, setDrag] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (files: FileList | null) => {
      if (files?.length) onFiles(Array.from(files));
    },
    [onFiles],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (!file.type.startsWith("image/")) continue;
        files.push(file);
      }
      if (!files.length) return;
      e.preventDefault();
      onFiles(files);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        handle(e.dataTransfer.files);
      }}
      style={{
        border: `2px dashed ${drag ? T.accent : T.border}`,
        borderRadius: T.radius + 4,
        padding: "32px 20px",
        background: drag ? T.accentBg : T.surface,
        textAlign: "center",
        transition: "all .2s",
        cursor: "pointer",
      }}
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 16 }}>
        ファイルをドロップ or 下のボタンから選択
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => cameraRef.current?.click()} style={btnStyle(T.accent, "#fff")}>
          📸 カメラ
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={btnStyle(T.surface, T.text, T.border)}
        >
          🖼️ フォルダ
        </button>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 10 }}>JPG / PNG / WEBP — D&D / Ctrl+V 貼り付け対応（PC）</div>
    </div>
  );
}
