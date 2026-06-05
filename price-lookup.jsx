import { useState, useRef, useCallback } from "react";

const C = {
  bg: "#0a0a0a", surface: "#141414", surfHov: "#1c1c1c",
  border: "#252525", borderL: "#333", text: "#e8e8e8",
  muted: "#888", accent: "#22c55e", accentDim: "rgba(34,197,94,0.12)",
  rakuten: "#bf0000", yahoo: "#ff6633", mercari: "#4dc9f6",
  danger: "#ef4444", warn: "#eab308", info: "#3b82f6",
};

const MARKETS = [
  { id: "rakuten", name: "楽天市場", color: C.rakuten, icon: "🛒",
    url: q => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/` },
  { id: "yahoo", name: "ヤフオク", color: C.yahoo, icon: "🔨",
    url: q => `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(q)}` },
  { id: "mercari", name: "メルカリ", color: C.mercari, icon: "📦",
    url: q => `https://jp.mercari.com/search?keyword=${encodeURIComponent(q)}` },
];

function compress(file, maxSize) {
  return new Promise((ok, ng) => {
    const r = new FileReader();
    r.onerror = () => ng(new Error("FileReader error"));
    r.onload = e => {
      const img = new Image();
      img.onerror = () => ng(new Error(`Image decode error (${file.type || "?"})`));
      img.onload = () => {
        try {
          const cv = document.createElement("canvas");
          const s = Math.min(maxSize / img.width, maxSize / img.height, 1);
          cv.width = Math.round(img.width * s);
          cv.height = Math.round(img.height * s);
          cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
          ok({
            base64: cv.toDataURL("image/jpeg", 0.6).split(",")[1],
            preview: cv.toDataURL("image/jpeg", 0.3),
            w: cv.width, h: cv.height,
          });
        } catch (err) { ng(new Error("Canvas: " + err.message)); }
      };
      img.src = e.target.result;
    };
    r.readAsDataURL(file);
  });
}

function extractJSON(raw) {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(raw.slice(s, e + 1)); } catch {} }
  try { return JSON.parse(raw.trim()); } catch {}
  return null;
}

async function callAPI(payload) {
  let resp;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`[fetch reject] ${err.name || "Error"}: ${err.message}\nstack: ${(err.stack || "").slice(0, 300)}`);
  }

  let respText;
  try { respText = await resp.text(); } catch (err) {
    throw new Error(`[text read fail HTTP ${resp.status}] ${err.message}`);
  }

  if (!resp.ok) throw new Error(`[HTTP ${resp.status}]\n${respText.slice(0, 600)}`);
  if (!respText) throw new Error(`[empty body HTTP ${resp.status}]`);

  let data;
  try { data = JSON.parse(respText); } catch (err) {
    throw new Error(`[JSON parse fail] ${err.message}\nraw:\n${respText.slice(0, 600)}`);
  }

  if (data.error) throw new Error(`[API error] ${data.error.type || "?"}: ${data.error.message || JSON.stringify(data.error)}`);

  const blocks = data.content || [];
  if (!Array.isArray(blocks) || !blocks.length) {
    throw new Error(`[no content]\ndata:\n${JSON.stringify(data).slice(0, 600)}`);
  }
  return blocks.filter(c => c.type === "text").map(c => c.text || "").join("");
}

async function identifyWithImage(base64) {
  const txt = await callAPI({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
        { type: "text", text: `この画像の商品を特定し、純粋なJSONのみで回答してください。説明文・コードブロックは禁止です。

{"product_name":"ブランド名と製品名と型番","brand":"メーカー","model":"型番","category":"カテゴリ","condition_hints":"外観の状態","search_query":"中古検索用キーワード（日本語）","confidence":"high または medium または low"}` },
      ],
    }],
  });
  const parsed = extractJSON(txt);
  if (!parsed) throw new Error(`[JSON抽出失敗]\nClaude応答:\n${txt.slice(0, 500)}`);
  return parsed;
}

async function testTextOnly() {
  return await callAPI({
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: [{ role: "user", content: "「OK」とだけ答えて" }],
  });
}

async function testTinyImage() {
  // 10x10 赤い四角のbase64（事前生成）
  const cv = document.createElement("canvas");
  cv.width = 10; cv.height = 10;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, 10, 10);
  const b64 = cv.toDataURL("image/jpeg", 0.5).split(",")[1];
  return await callAPI({
    model: "claude-sonnet-4-20250514",
    max_tokens: 50,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text: "この画像の色を一言で" },
      ],
    }],
  });
}

function Diag({ onClose }) {
  const [tests, setTests] = useState([]);
  const run = async (name, fn) => {
    setTests(t => [...t, { name, status: "running" }]);
    try {
      const r = await fn();
      setTests(t => t.map(x => x.name === name ? { ...x, status: "ok", result: typeof r === "string" ? r.slice(0, 200) : JSON.stringify(r).slice(0, 200) } : x));
    } catch (e) {
      setTests(t => t.map(x => x.name === name ? { ...x, status: "ng", result: e.message } : x));
    }
  };

  return (
    <div style={{ padding: 16, borderRadius: 14, background: C.surface, border: `1px solid ${C.info}33`, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.info, fontWeight: 600 }}>🔧 API診断</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, fontSize: 14, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <button onClick={() => run("1. テキストのみAPI", testTextOnly)} style={{ padding: 10, borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, cursor: "pointer", textAlign: "left" }}>
          ① テキストのみのAPI呼び出しテスト
        </button>
        <button onClick={() => run("2. 極小画像API", testTinyImage)} style={{ padding: 10, borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, cursor: "pointer", textAlign: "left" }}>
          ② 10×10極小画像のAPI呼び出しテスト
        </button>
      </div>
      {tests.map((t, i) => (
        <div key={i} style={{ marginBottom: 8, padding: 8, borderRadius: 6, background: C.bg, fontSize: 11, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: C.text, fontWeight: 500 }}>{t.name}</span>
            <span style={{ color: t.status === "ok" ? C.accent : t.status === "ng" ? C.danger : C.warn }}>
              {t.status === "ok" ? "✓ 成功" : t.status === "ng" ? "✗ 失敗" : "⏳ 実行中"}
            </span>
          </div>
          {t.result && (
            <pre style={{ color: C.muted, fontSize: 10, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, monospace", marginTop: 4, lineHeight: 1.5 }}>{t.result}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

function Result({ result, preview }) {
  const q = result.search_query || result.product_name;
  const cc = result.confidence === "high" ? C.accent : result.confidence === "medium" ? C.warn : C.danger;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginTop: 14, animation: "fadeUp .4s ease" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        {preview && <img src={preview} alt="" style={{ width: 76, height: 76, borderRadius: 10, objectFit: "cover", border: `1px solid ${C.border}` }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, wordBreak: "break-word" }}>{result.product_name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
            {[result.brand, result.model, result.category].filter(Boolean).map((t, i) => (
              <span key={i} style={{ background: "rgba(255,255,255,.06)", padding: "2px 7px", borderRadius: 4, fontSize: 10, color: C.muted }}>{t}</span>
            ))}
            <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: `${cc}18`, color: cc }}>{result.confidence}</span>
          </div>
          {result.condition_hints && <div style={{ fontSize: 11, color: C.muted, marginTop: 7 }}>💡 {result.condition_hints}</div>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>中古相場を検索 →</div>
      {MARKETS.map(m => (
        <a key={m.id} href={m.url(q)} target="_blank" rel="noopener noreferrer" style={{
          display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, marginBottom: 7,
          background: `${m.color}11`, border: `1px solid ${m.color}33`, color: C.text, textDecoration: "none", fontSize: 14, fontWeight: 500,
        }}>
          <span style={{ fontSize: 19 }}>{m.icon}</span>
          <span style={{ flex: 1 }}>{m.name}で検索</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={m.color} strokeWidth="2"><path d="M7 17L17 7M17 7H7M17 7V17" /></svg>
        </a>
      ))}
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState("");
  const [log, setLog] = useState("");
  const [showDiag, setShowDiag] = useState(false);
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  const copyErr = () => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(err).catch(() => {});
  };

  const process = useCallback(async (file) => {
    if (!file) return;
    setPhase("loading"); setErr(""); setResult(null);
    setLog(`読み込み: ${file.name} (${file.type || "?"}, ${Math.round(file.size/1024)}KB)`);
    try {
      const { base64, preview: pv, w, h } = await compress(file, 512);
      setPreview(pv);
      setLog(`圧縮: ${w}×${h}, ${Math.round(base64.length/1024)}KB → API送信中...`);
      const res = await identifyWithImage(base64);
      setResult(res); setPhase("done"); setLog("");
    } catch (e) {
      console.error(e);
      setErr(String(e?.message || e || "不明なエラー"));
      setPhase("error");
    }
  }, []);

  const reset = () => { setPhase("idle"); setResult(null); setPreview(null); setErr(""); setLog(""); };
  const onFile = e => { process(e.target.files?.[0]); e.target.value = ""; };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Noto Sans JP','SF Pro Text',-apple-system,sans-serif", padding: "0 16px 40px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
      <input ref={libraryRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />

      <header style={{ padding: "18px 0 13px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 700 }}><span style={{ color: C.accent }}>📷</span> 相場チェッカー</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>撮って → 特定 → 相場検索</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => setShowDiag(!showDiag)} style={{
            fontSize: 10, padding: "4px 8px", borderRadius: 5,
            background: showDiag ? C.info : "rgba(255,255,255,.05)",
            color: showDiag ? "#fff" : C.muted, border: `1px solid ${C.border}`,
            cursor: "pointer", fontWeight: 600,
          }}>🔧 診断</button>
          <div style={{ fontSize: 9, padding: "3px 8px", borderRadius: 4, background: C.accentDim, color: C.accent, fontWeight: 600 }}>PROTO v4</div>
        </div>
      </header>

      {showDiag && <Diag onClose={() => setShowDiag(false)} />}

      <div style={{ marginTop: 20 }}>
        {phase === "idle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button onClick={() => cameraRef.current?.click()} style={{
              width: "100%", padding: "36px 20px", borderRadius: 14,
              background: `linear-gradient(135deg,${C.surface},${C.surfHov})`,
              border: `2px dashed ${C.borderL}`, color: C.text, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
            }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>📸</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>カメラで撮影</div>
            </button>
            <button onClick={() => libraryRef.current?.click()} style={{
              width: "100%", padding: "16px 20px", borderRadius: 12,
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              fontSize: 14, fontWeight: 500,
            }}>
              <span style={{ fontSize: 18 }}>🖼️</span> 写真フォルダから選択
            </button>
          </div>
        )}

        {phase === "loading" && (
          <div style={{
            padding: "30px 20px", borderRadius: 16, background: C.surface,
            border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          }}>
            {preview && <img src={preview} alt="" style={{ width: 88, height: 88, borderRadius: 12, objectFit: "cover", opacity: .7 }} />}
            <div style={{ width: 26, height: 26, border: `3px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
            <div style={{ fontSize: 14, fontWeight: 500 }}>商品を特定中...</div>
            {log && <div style={{ fontSize: 10, color: C.muted, padding: "6px 10px", background: "rgba(255,255,255,.03)", borderRadius: 6, wordBreak: "break-all", textAlign: "center", lineHeight: 1.5, fontFamily: "monospace" }}>{log}</div>}
          </div>
        )}

        {phase === "error" && (
          <div style={{ padding: 16, borderRadius: 14, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>⚠️ エラー詳細</div>
              <button onClick={copyErr} style={{
                background: "rgba(255,255,255,.05)", border: `1px solid ${C.border}`,
                color: C.text, fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
              }}>📋 コピー</button>
            </div>
            <pre style={{
              fontSize: 10, color: C.text, marginBottom: 12, lineHeight: 1.5,
              maxHeight: 280, overflow: "auto",
              padding: "10px 12px", background: "#000", borderRadius: 6,
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              border: `1px solid ${C.border}`,
            }}>{err}</pre>
            <div style={{
              padding: "8px 10px", background: "rgba(59,130,246,.08)",
              border: `1px solid ${C.info}33`, borderRadius: 6, marginBottom: 10,
              fontSize: 10, color: C.muted, lineHeight: 1.6,
            }}>
              💡 右上の <span style={{ color: C.info, fontWeight: 600 }}>🔧 診断</span> ボタンでAPI接続テストができます。①テキスト ②極小画像 を順に試してください。
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={reset} style={{ flex: 1, padding: 10, borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, cursor: "pointer" }}>戻る</button>
              <button onClick={() => libraryRef.current?.click()} style={{ flex: 1, padding: 10, borderRadius: 8, background: C.danger, border: "none", color: "#fff", fontSize: 13, cursor: "pointer" }}>別の画像</button>
            </div>
          </div>
        )}

        {phase === "done" && result && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => cameraRef.current?.click()} style={{
                flex: 1, padding: 11, borderRadius: 10, background: C.surface,
                border: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}>📸 撮影</button>
              <button onClick={() => libraryRef.current?.click()} style={{
                flex: 1, padding: 11, borderRadius: 10, background: C.accentDim,
                border: `1px solid ${C.accent}33`, color: C.accent, fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}>🖼️ フォルダ</button>
            </div>
            <Result result={result} preview={preview} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 34, padding: "12px 0", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted, textAlign: "center", lineHeight: 1.7 }}>
        プロトタイプ v4 — 商品特定: Claude API
      </div>
    </div>
  );
}
