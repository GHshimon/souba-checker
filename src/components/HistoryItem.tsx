import type { HistoryEntry } from "../types";
import { T } from "../lib/constants";

interface HistoryItemProps {
  item: HistoryEntry;
  onClick: () => void;
}

export function HistoryItem({ item, onClick }: HistoryItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: 10,
        cursor: "pointer",
        textAlign: "left",
        marginBottom: 4,
      }}
    >
      {item.thumbnail && (
        <img
          src={item.thumbnail}
          alt=""
          style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: T.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.product.name}
        </div>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
          {item.product.jan ? `JAN: ${item.product.jan}` : "Gemini特定"}
          {" · "}
          {item.time}
        </div>
      </div>
    </button>
  );
}
