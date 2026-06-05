import { T } from "../lib/constants";

interface BarcodeResultProps {
  code: string;
  format: string;
}

export function BarcodeResult({ code, format }: BarcodeResultProps) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: T.radius,
        background: T.successBg,
        border: `1px solid ${T.success}22`,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ fontSize: 22 }}>✅</span>
      <div>
        <div style={{ fontSize: 11, color: T.success, fontWeight: 600 }}>バーコード検出</div>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: T.mono, color: T.text, letterSpacing: 1 }}>
          {code}
        </div>
        <div style={{ fontSize: 10, color: T.muted }}>{format}</div>
      </div>
    </div>
  );
}
