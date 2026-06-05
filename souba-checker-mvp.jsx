import { useState, useRef, useCallback, useEffect } from "react";

// ─── Config ───
const MARKETS = [
  { id: "rakuten", name: "楽天市場", color: "#bf0000", icon: "🛒",
    url: q => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/` },
  { id: "yahoo", name: "ヤフオク", color: "#ff6633", icon: "🔨",
    url: q => `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(q)}` },
  { id: "amazon", name: "Amazon", color: "#ff9900", icon: "📦",
    url: q => `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}` },
  { id: "mercari", name: "メルカリ", color: "#4dc9f6", icon: "🏷️",
    url: q => `https://jp.mercari.com/search?keyword=${encodeURIComponent(q)}` },
  { id: "yahoo_shop", name: "Yahoo!ショッピング", color: "#ff0033", icon: "🛍️",
    url: q => `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(q)}` },
];

// ─── Barcode Detection ───
async function detectBarcode(imageSrc) {
  if (!("BarcodeDetector" in window)) {
    return { supported: false, codes: [] };
  }
  try {
    const img = new Image();
    await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = imageSrc; });
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] });
    const results = await detector.detect(img);
    return { supported: true, codes: results.map(r => ({ value: r.rawValue, format: r.format })) };
  } catch {
    return { supported: true, codes: [] };
  }
}

// ─── Image compression ───
function compressImage(file, maxSize = 800) {
  return new Promise((ok, ng) => {
    const r = new FileReader();
    r.onerror = () => ng(new Error("読み込み失敗"));
    r.onload = e => {
      const img = new Image();
      img.onerror = () => ng(new Error("画像デコード失敗"));
      img.onload = () => {
        const cv = document.createElement("canvas");
        const s = Math.min(maxSize / img.width, maxSize / img.height, 1);
        cv.width = Math.round(img.width * s);
        cv.height = Math.round(img.height * s);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        ok({ dataUrl: cv.toDataURL("image/jpeg", 0.7), w: cv.width, h: cv.height });
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  });
}

// ─── Styles ───
const T = {
  bg: "#fafaf8", surface: "#fff", border: "#e5e2db",
  text: "#1a1a1a", muted: "#7a7a72", accent: "#2563eb",
  accentBg: "#eff4ff", success: "#16a34a", successBg: "#f0fdf4",
  danger: "#dc2626", dangerBg: "#fef2f2", warn: "#d97706", warnBg: "#fffbeb",
  font: "'DM Sans', 'Noto Sans JP', -apple-system, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
  radius: 12,
};

// ─── Components ───

function DropZone({ onFiles, multiple = true }) {
  const [drag, setDrag] = useState(false);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const handle = useCallback((files) => {
    if (files?.length) onFiles(Array.from(files));
  }, [onFiles]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
      style={{
        border: `2px dashed ${drag ? T.accent : T.border}`,
        borderRadius: T.radius + 4, padding: "32px 20px",
        background: drag ? T.accentBg : T.surface,
        textAlign: "center", transition: "all .2s",
        cursor: "pointer",
      }}
    >
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        onChange={e => { handle(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
      <input ref={fileRef} type="file" accept="image/*" multiple={multiple}
        onChange={e => { handle(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />

      <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 16 }}>
        ファイルをドロップ or 下のボタンから選択
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button onClick={() => cameraRef.current?.click()} style={btnStyle(T.accent, "#fff")}>
          📸 カメラ
        </button>
        <button onClick={() => fileRef.current?.click()} style={btnStyle(T.surface, T.text, T.border)}>
          🖼️ フォルダ
        </button>
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 10 }}>
        JPG / PNG / HEIC / WEBP — D&D対応（PC）
      </div>
    </div>
  );
}

function ImagePreview({ images, onRemove }) {
  if (!images.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
      {images.map((img, i) => (
        <div key={i} style={{ position: "relative" }}>
          <img src={img.dataUrl} alt="" style={{
            width: 72, height: 72, objectFit: "cover", borderRadius: 8,
            border: `1px solid ${T.border}`,
          }} />
          <button onClick={() => onRemove(i)} style={{
            position: "absolute", top: -6, right: -6, width: 20, height: 20,
            borderRadius: "50%", background: T.danger, color: "#fff",
            border: "none", fontSize: 11, cursor: "pointer", lineHeight: "20px",
            padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
          {img.barcode && (
            <div style={{
              position: "absolute", bottom: 2, left: 2, right: 2,
              background: "rgba(0,0,0,.7)", color: "#fff", fontSize: 8,
              padding: "1px 3px", borderRadius: 4, textAlign: "center",
              fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{img.barcode}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function BarcodeResult({ code, format }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: T.radius,
      background: T.successBg, border: `1px solid ${T.success}22`,
      display: "flex", alignItems: "center", gap: 10,
    }}>
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

function ProductCard({ product, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState(product.searchQuery);

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radius + 2, padding: 18, marginTop: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
            {product.name}
          </div>
          {product.jan && (
            <div style={{ fontSize: 11, color: T.muted, fontFamily: T.mono, marginTop: 4 }}>
              JAN: {product.jan}
            </div>
          )}
          {product.source && (
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 4, marginTop: 6,
              display: "inline-block",
              background: product.source === "barcode" ? T.successBg : T.accentBg,
              color: product.source === "barcode" ? T.success : T.accent,
              fontWeight: 600,
            }}>
              {product.source === "barcode" ? "バーコード特定" : "AI特定"}
            </span>
          )}
        </div>
      </div>

      {/* 検索ワード編集 */}
      <div style={{
        padding: "8px 12px", borderRadius: 8, background: T.bg,
        marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 12, color: T.muted, whiteSpace: "nowrap" }}>🔍</span>
        {editing ? (
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onBlur={() => { setEditing(false); onEdit?.(query); }}
            onKeyDown={e => { if (e.key === "Enter") { setEditing(false); onEdit?.(query); } }}
            autoFocus
            style={{
              flex: 1, border: `1px solid ${T.accent}`, borderRadius: 6,
              padding: "4px 8px", fontSize: 13, fontFamily: T.font,
              outline: "none",
            }}
          />
        ) : (
          <div
            onClick={() => setEditing(true)}
            style={{
              flex: 1, fontSize: 13, color: T.text, cursor: "text",
              padding: "4px 0",
            }}
          >{query}</div>
        )}
        <button onClick={() => setEditing(!editing)} style={{
          background: "none", border: "none", fontSize: 12,
          color: T.accent, cursor: "pointer", fontWeight: 600,
        }}>{editing ? "確定" : "編集"}</button>
      </div>

      {/* 検索リンク */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {MARKETS.map(m => (
          <a key={m.id} href={m.url(query)} target="_blank" rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderRadius: 10,
              background: `${m.color}08`, border: `1px solid ${m.color}18`,
              color: T.text, textDecoration: "none", fontSize: 13, fontWeight: 500,
              transition: "background .15s",
            }}
          >
            <span style={{ fontSize: 17 }}>{m.icon}</span>
            <span style={{ flex: 1 }}>{m.name}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={m.color} strokeWidth="2" strokeLinecap="round">
              <path d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </a>
        ))}
      </div>

      {/* API価格表示エリア（将来用） */}
      <div style={{
        marginTop: 14, padding: "10px 14px", borderRadius: 8,
        background: T.warnBg, border: `1px solid ${T.warn}22`,
        fontSize: 11, color: T.warn,
      }}>
        💡 価格自動取得はAPIキー設定後に有効になります（楽天・ヤフオク・Amazon）
      </div>
    </div>
  );
}

function HistoryItem({ item, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%",
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: 10, cursor: "pointer", textAlign: "left",
      marginBottom: 4,
    }}>
      {item.thumbnail && (
        <img src={item.thumbnail} alt="" style={{
          width: 40, height: 40, borderRadius: 6, objectFit: "cover",
        }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: T.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{item.product.name}</div>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
          {item.product.source === "barcode" ? `JAN: ${item.product.jan}` : "AI特定"}
          {" · "}{item.time}
        </div>
      </div>
    </button>
  );
}

function StatusBadge({ barcodeSupported }) {
  return (
    <div style={{
      display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12,
    }}>
      <span style={{
        fontSize: 10, padding: "3px 8px", borderRadius: 4,
        background: barcodeSupported ? T.successBg : T.dangerBg,
        color: barcodeSupported ? T.success : T.danger,
        fontWeight: 600,
      }}>
        {barcodeSupported ? "✓ BarcodeDetector対応" : "✕ BarcodeDetector非対応 → Quagga2で対応予定"}
      </span>
    </div>
  );
}

function btnStyle(bg, color, border) {
  return {
    padding: "10px 20px", borderRadius: 10,
    background: bg, color: color,
    border: border ? `1px solid ${border}` : "none",
    fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: T.font,
  };
}

// ─── Main App ───
export default function SoubaChecker() {
  const [images, setImages] = useState([]);
  const [barcodes, setBarcodes] = useState([]);
  const [product, setProduct] = useState(null);
  const [phase, setPhase] = useState("input"); // input | scanning | result
  const [log, setLog] = useState("");
  const [history, setHistory] = useState([]);
  const [barcodeSupported, setBarcodeSupported] = useState(null);

  useEffect(() => {
    setBarcodeSupported("BarcodeDetector" in window);
  }, []);

  const addFiles = useCallback(async (files) => {
    const newImages = [];
    for (const f of files.slice(0, 5 - images.length)) {
      try {
        const compressed = await compressImage(f);
        newImages.push({ ...compressed, file: f, barcode: null });
      } catch (e) {
        console.error(e);
      }
    }
    setImages(prev => [...prev, ...newImages].slice(0, 5));
  }, [images.length]);

  const removeImage = (i) => setImages(prev => prev.filter((_, idx) => idx !== i));

  const scan = useCallback(async () => {
    if (!images.length) return;
    setPhase("scanning");
    setLog("バーコードスキャン中...");
    setBarcodes([]);

    const foundCodes = [];

    // 全画像をバーコードスキャン
    for (let i = 0; i < images.length; i++) {
      setLog(`画像 ${i + 1}/${images.length} をスキャン中...`);
      const result = await detectBarcode(images[i].dataUrl);
      if (result.codes.length > 0) {
        foundCodes.push(...result.codes);
        setImages(prev => prev.map((img, idx) =>
          idx === i ? { ...img, barcode: result.codes[0].value } : img
        ));
      }
    }

    setBarcodes(foundCodes);

    if (foundCodes.length > 0) {
      const jan = foundCodes[0].value;
      setLog(`JAN: ${jan} を検出 → 商品検索...`);

      // TODO: Yahoo商品検索APIで jan_code → 商品名
      // 現在はJANコードをそのまま検索ワードに使用
      const prod = {
        name: `JAN: ${jan}（API接続後に商品名を自動取得）`,
        jan: jan,
        searchQuery: jan,
        source: "barcode",
      };
      setProduct(prod);
      setHistory(h => [{
        product: prod,
        thumbnail: images[0]?.dataUrl,
        time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      }, ...h].slice(0, 30));
      setPhase("result");
      setLog("");
    } else {
      setLog("バーコード未検出 → 画像AI特定にフォールバック");

      // TODO: Gemini APIで画像から商品特定
      const prod = {
        name: "（Gemini API接続後に商品名を自動特定）",
        jan: null,
        searchQuery: "",
        source: "ai",
      };
      setProduct(prod);
      setPhase("result");
      setLog("");
    }
  }, [images]);

  const reset = () => {
    setPhase("input");
    setImages([]);
    setBarcodes([]);
    setProduct(null);
    setLog("");
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, color: T.text,
      fontFamily: T.font, maxWidth: 480, margin: "0 auto", padding: "0 16px 40px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+JP:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes spin { to { transform:rotate(360deg) } }
        a:hover { opacity: 0.85; }
      `}</style>

      {/* Header */}
      <header style={{
        padding: "20px 0 16px",
        borderBottom: `1px solid ${T.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
      }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
            相場チェッカー
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
            バーコード or 撮影 → 相場検索
          </div>
        </div>
        <div style={{
          fontSize: 9, padding: "3px 10px", borderRadius: 6,
          background: T.accentBg, color: T.accent, fontWeight: 700,
          letterSpacing: .5,
        }}>MVP</div>
      </header>

      <StatusBadge barcodeSupported={barcodeSupported} />

      {/* ─── INPUT PHASE ─── */}
      {phase === "input" && (
        <div style={{ marginTop: 20, animation: "fadeUp .3s ease" }}>
          <DropZone onFiles={addFiles} />
          <ImagePreview images={images} onRemove={removeImage} />

          {images.length > 0 && (
            <button onClick={scan} style={{
              ...btnStyle(T.accent, "#fff"),
              width: "100%", marginTop: 14, padding: "14px 20px",
              fontSize: 15,
            }}>
              🔍 スキャン開始（{images.length}枚）
            </button>
          )}

          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 8,
            background: T.bg, border: `1px solid ${T.border}`,
            fontSize: 11, color: T.muted, lineHeight: 1.7,
          }}>
            <strong>使い方：</strong>商品のバーコードを撮影してスキャン。
            バーコードが無い場合はAI画像認識にフォールバックします。
            最大5枚まで同時に処理できます。
          </div>
        </div>
      )}

      {/* ─── SCANNING PHASE ─── */}
      {phase === "scanning" && (
        <div style={{
          marginTop: 20, padding: "40px 20px", borderRadius: T.radius + 4,
          background: T.surface, border: `1px solid ${T.border}`,
          textAlign: "center", animation: "fadeUp .3s ease",
        }}>
          <div style={{
            width: 32, height: 32, border: `3px solid ${T.border}`,
            borderTopColor: T.accent, borderRadius: "50%",
            animation: "spin .7s linear infinite",
            margin: "0 auto 16px",
          }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>スキャン中</div>
          {log && (
            <div style={{
              fontSize: 11, color: T.muted, marginTop: 8,
              fontFamily: T.mono,
            }}>{log}</div>
          )}
        </div>
      )}

      {/* ─── RESULT PHASE ─── */}
      {phase === "result" && product && (
        <div style={{ marginTop: 20, animation: "fadeUp .3s ease" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset} style={{
              ...btnStyle(T.surface, T.text, T.border), flex: 1,
            }}>← 新規スキャン</button>
            <button onClick={() => { reset(); }} style={{
              ...btnStyle(T.accentBg, T.accent, `${T.accent}33`), flex: 1,
            }}>📸 別の商品</button>
          </div>

          {barcodes.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <BarcodeResult code={barcodes[0].value} format={barcodes[0].format} />
            </div>
          )}

          {barcodes.length === 0 && (
            <div style={{
              marginTop: 12, padding: "10px 14px", borderRadius: T.radius,
              background: T.warnBg, border: `1px solid ${T.warn}22`,
              fontSize: 12, color: T.warn,
            }}>
              ⚠️ バーコード未検出 — AI画像認識はGemini APIキー設定後に有効化
            </div>
          )}

          <ProductCard
            product={product}
            onEdit={(newQuery) => setProduct({ ...product, searchQuery: newQuery })}
          />
        </div>
      )}

      {/* ─── HISTORY ─── */}
      {history.length > 0 && phase === "input" && (
        <div style={{ marginTop: 28 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", marginBottom: 8,
          }}>
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>
              履歴（{history.length}件）
            </span>
            <button onClick={() => setHistory([])} style={{
              background: "none", border: "none", color: T.danger,
              fontSize: 11, cursor: "pointer",
            }}>クリア</button>
          </div>
          {history.map((h, i) => (
            <HistoryItem key={i} item={h} onClick={() => {
              setProduct(h.product);
              setBarcodes(h.product.jan ? [{ value: h.product.jan, format: "ean_13" }] : []);
              setPhase("result");
            }} />
          ))}
        </div>
      )}

      {/* ─── API Status ─── */}
      {phase === "input" && (
        <div style={{
          marginTop: 28, padding: "14px 16px", borderRadius: T.radius,
          background: T.surface, border: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 10 }}>
            API接続状況
          </div>
          {[
            { name: "バーコード読取", status: "active", note: "ブラウザ内処理" },
            { name: "検索リンク生成", status: "active", note: "5サイト対応" },
            { name: "Yahoo商品検索（JAN→商品名）", status: "pending", note: "Client ID未設定" },
            { name: "楽天市場 価格取得", status: "pending", note: "App ID未設定" },
            { name: "ヤフオク 相場取得", status: "pending", note: "Client ID未設定" },
            { name: "Amazon 価格取得", status: "pending", note: "PA-API未設定" },
            { name: "Gemini 画像AI特定", status: "pending", note: "API Key未設定" },
          ].map((api, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 0", borderTop: i ? `1px solid ${T.bg}` : "none",
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: api.status === "active" ? T.success : "#ccc",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: T.text, flex: 1 }}>{api.name}</span>
              <span style={{
                fontSize: 10,
                color: api.status === "active" ? T.success : T.muted,
                fontWeight: api.status === "active" ? 600 : 400,
              }}>{api.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: 32, padding: "14px 0",
        borderTop: `1px solid ${T.border}`,
        fontSize: 10, color: T.muted, textAlign: "center", lineHeight: 1.7,
      }}>
        相場チェッカー MVP — バーコード優先 / 画像AIフォールバック<br />
        Quagga2(MIT) · Yahoo API · 楽天API · Amazon PA-API
      </div>
    </div>
  );
}
