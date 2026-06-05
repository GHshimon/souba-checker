import { T } from "../lib/constants";

interface StatusBadgeProps {
  barcodeSupported: boolean | null;
}

export function StatusBadge({ barcodeSupported }: StatusBadgeProps) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
      <span
        style={{
          fontSize: 10,
          padding: "3px 8px",
          borderRadius: 4,
          background: barcodeSupported ? T.successBg : T.warnBg,
          color: barcodeSupported ? T.success : T.warn,
          fontWeight: 600,
        }}
      >
        {barcodeSupported
          ? "✓ BarcodeDetector対応（Quagga2も利用可）"
          : "Quagga2でバーコード読取"}
      </span>
      <span
        style={{
          fontSize: 10,
          padding: "3px 8px",
          borderRadius: 4,
          background: T.accentBg,
          color: T.accent,
          fontWeight: 600,
        }}
      >
        Geminiで商品特定
      </span>
    </div>
  );
}

const API_STATUS = [
  { name: "Gemini 商品特定", note: "画像→型番・検索ワード" },
  { name: "楽天市場 価格取得", note: "最安/平均" },
  { name: "Yahoo!ショッピング 価格取得", note: "参考価格" },
  { name: "ヤフオク / メルカリ", note: "検索リンク（APIなし）" },
  { name: "バーコード読取", note: "JAN補助（ブラウザ内）" },
];

export function ApiStatus() {
  return (
    <div
      style={{
        marginTop: 28,
        padding: "14px 16px",
        borderRadius: T.radius,
        background: T.surface,
        border: `1px solid ${T.border}`,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 10 }}>機能一覧</div>
      {API_STATUS.map((api, i) => (
        <div
          key={api.name}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
            borderTop: i ? `1px solid ${T.bg}` : "none",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: T.success,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, color: T.text, flex: 1 }}>{api.name}</span>
          <span style={{ fontSize: 10, color: T.muted }}>{api.note}</span>
        </div>
      ))}
    </div>
  );
}
