import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { BarcodeResult } from "./components/BarcodeResult";
import { DropZone } from "./components/DropZone";
import { HistoryItem } from "./components/HistoryItem";
import { ImagePreview } from "./components/ImagePreview";
import { ProductCard } from "./components/ProductCard";
import { ApiStatus, StatusBadge } from "./components/StatusBadge";
import { fetchPrices, fetchSimilarProducts, identifyProduct } from "./lib/api";
import { btnStyle, T } from "./lib/constants";
import { clearHistory, loadHistory, saveHistory } from "./lib/db";
import { compressImage, dataUrlToBase64, detectBarcode } from "./lib/image";
import { loadResearchDraft, saveResearchDraft } from "./lib/researchDraft";
import type {
  BarcodeResult as BarcodeResultType,
  CompressedImage,
  HistoryEntry,
  PricesResponse,
  Product,
  SimilarResponse,
} from "./types";

type Phase = "input" | "scanning" | "result";

const InsightsPanel = lazy(() => import("./components/InsightsPanel").then((m) => ({ default: m.InsightsPanel })));

function buildProduct(
  identified: {
    product_name: string;
    brand?: string;
    model?: string;
    category?: string;
    search_query: string;
    confidence?: "high" | "medium" | "low";
    jan_code?: string;
  },
  detectedJan?: string,
): Product {
  return {
    id: crypto.randomUUID(),
    name: identified.product_name,
    jan: identified.jan_code || detectedJan || null,
    searchQuery: identified.search_query || identified.product_name,
    source: "ai",
    brand: identified.brand,
    model: identified.model,
    category: identified.category,
    confidence: identified.confidence,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"checker" | "insights">("checker");
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [barcodes, setBarcodes] = useState<BarcodeResultType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [excludedProductIds, setExcludedProductIds] = useState<Record<string, boolean>>({});
  const [pricesByProduct, setPricesByProduct] = useState<Record<string, PricesResponse | null>>({});
  const [pricesLoadingByProduct, setPricesLoadingByProduct] = useState<Record<string, boolean>>({});
  const [similarByProduct, setSimilarByProduct] = useState<Record<string, SimilarResponse | null>>({});
  const [similarLoadingByProduct, setSimilarLoadingByProduct] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>("input");
  const [log, setLog] = useState("");
  const [scanError, setScanError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [barcodeSupported, setBarcodeSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setBarcodeSupported("BarcodeDetector" in window);
    loadHistory().then(setHistory).catch(console.error);
  }, []);

  const loadPrices = useCallback(async (productId: string, query: string, maker?: string) => {
    if (!query) return;
    setPricesLoadingByProduct((prev) => ({ ...prev, [productId]: true }));
    setPricesByProduct((prev) => ({ ...prev, [productId]: null }));
    try {
      const result = await fetchPrices(query, maker);
      setPricesByProduct((prev) => ({ ...prev, [productId]: result }));
    } catch {
      setPricesByProduct((prev) => ({ ...prev, [productId]: null }));
    } finally {
      setPricesLoadingByProduct((prev) => ({ ...prev, [productId]: false }));
    }
  }, []);

  const loadSimilar = useCallback(async (product: Product) => {
    setSimilarLoadingByProduct((prev) => ({ ...prev, [product.id]: true }));
    try {
      const result = await fetchSimilarProducts({
        product_name: product.name,
        brand: product.brand,
        model: product.model,
        category: product.category,
        search_query: product.searchQuery,
      });
      setSimilarByProduct((prev) => ({ ...prev, [product.id]: result }));
    } catch {
      setSimilarByProduct((prev) => ({ ...prev, [product.id]: null }));
    } finally {
      setSimilarLoadingByProduct((prev) => ({ ...prev, [product.id]: false }));
    }
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const newImages: CompressedImage[] = [];
      for (const f of files.slice(0, 5 - images.length)) {
        try {
          const compressed = await compressImage(f);
          newImages.push({ ...compressed, file: f, barcode: null });
        } catch (e) {
          console.error(e);
        }
      }
      setImages((prev) => [...prev, ...newImages].slice(0, 5));
      setScanError("");
    },
    [images.length],
  );

  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  const saveToHistory = useCallback(async (prod: Product, thumbnail?: string) => {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      product: prod,
      thumbnail,
      time: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      timestamp: Date.now(),
    };
    await saveHistory(entry);
    setHistory((h) => [entry, ...h].slice(0, 30));
  }, []);

  const scan = useCallback(async () => {
    if (!images.length) return;
    setPhase("scanning");
    setScanError("");
    setLog("バーコードスキャン中...");
    setBarcodes([]);
    setPricesByProduct({});
    setPricesLoadingByProduct({});
    setSimilarByProduct({});
    setSimilarLoadingByProduct({});
    setExcludedProductIds({});

    const foundCodes: BarcodeResultType[] = [];
    const updatedImages = [...images];

    for (let i = 0; i < updatedImages.length; i++) {
      setLog(`画像 ${i + 1}/${updatedImages.length} をスキャン中...`);
      const codes = await detectBarcode(updatedImages[i].dataUrl);
      if (codes.length > 0) {
        foundCodes.push(...codes);
        updatedImages[i] = { ...updatedImages[i], barcode: codes[0].value };
      }
    }
    setImages(updatedImages);
    setBarcodes(foundCodes);

    const detectedJan = foundCodes[0]?.value;
    setLog("Geminiで商品特定中...");

    try {
      const base64Images = images.map((img) => dataUrlToBase64(img.dataUrl));
      const identified = await identifyProduct(base64Images, detectedJan);
      const parsedProducts = (identified.products || []).map((p) => buildProduct(p, detectedJan));
      if (!parsedProducts.length) throw new Error("商品を抽出できませんでした");

      setProducts(parsedProducts);
      await saveToHistory(parsedProducts[0], images[0]?.dataUrl);
      setPhase("result");
      setLog("");
      parsedProducts.forEach((p) => {
        loadPrices(p.id, p.searchQuery, p.brand);
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "商品特定に失敗しました";

      if (detectedJan) {
        const prod: Product = {
          id: crypto.randomUUID(),
          name: `JAN: ${detectedJan}`,
          jan: detectedJan,
          searchQuery: detectedJan,
          source: "ai",
          confidence: "low",
        };
        setProducts([prod]);
        await saveToHistory(prod, images[0]?.dataUrl);
        setPhase("result");
        setScanError(`Gemini利用不可のためJANコードで検索します。${message}`);
        loadPrices(prod.id, detectedJan);
        return;
      }

      setScanError(message);
      setPhase("input");
      setLog("");
    }
  }, [images, loadPrices, saveToHistory]);

  const reset = () => {
    setPhase("input");
    setImages([]);
    setBarcodes([]);
    setProducts([]);
    setPricesByProduct({});
    setPricesLoadingByProduct({});
    setSimilarByProduct({});
    setSimilarLoadingByProduct({});
    setExcludedProductIds({});
    setLog("");
    setScanError("");
  };

  const handleEditQuery = (productId: string, newQuery: string) => {
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, searchQuery: newQuery } : p)));
    const target = products.find((p) => p.id === productId);
    if (target) loadPrices(productId, newQuery, target.brand);
  };

  const handleApplySimilarSearch = (productId: string, searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, searchQuery: trimmed } : p)));
    const target = products.find((p) => p.id === productId);
    loadPrices(productId, trimmed, target?.brand);
  };

  const currentResearch = useMemo(() => {
    const product = products.find((p) => !excludedProductIds[p.id]) || products[0];
    if (!product?.searchQuery?.trim()) return null;
    return {
      name: product.name,
      query: product.searchQuery.trim(),
      category: product.category || "未分類",
    };
  }, [products, excludedProductIds]);

  useEffect(() => {
    if (currentResearch) saveResearchDraft(currentResearch);
  }, [currentResearch]);

  const watchlistDraft = useMemo(() => {
    if (currentResearch) return currentResearch;
    if (activeTab === "insights") return loadResearchDraft();
    return null;
  }, [activeTab, currentResearch]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        color: T.text,
        fontFamily: T.font,
        maxWidth: 480,
        margin: "0 auto",
        padding: "0 16px 40px",
      }}
    >
      <header
        style={{
          padding: "20px 0 16px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>相場チェッカー</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>撮影 → Gemini特定 → 相場検索</div>
        </div>
        <div
          style={{
            fontSize: 9,
            padding: "3px 10px",
            borderRadius: 6,
            background: T.accentBg,
            color: T.accent,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          MVP
        </div>
      </header>

      <StatusBadge barcodeSupported={barcodeSupported} />

      {activeTab === "checker" && phase === "input" && (
        <div style={{ marginTop: 20, animation: "fadeUp .3s ease" }}>
          <DropZone onFiles={addFiles} />
          <ImagePreview images={images} onRemove={removeImage} />

          {scanError && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 8,
                background: T.dangerBg,
                border: `1px solid ${T.danger}22`,
                fontSize: 12,
                color: T.danger,
                lineHeight: 1.6,
              }}
            >
              ⚠️ {scanError}
            </div>
          )}

          {images.length > 0 && (
            <button
              type="button"
              onClick={scan}
              style={{
                ...btnStyle(T.accent, "#fff"),
                width: "100%",
                marginTop: 14,
                padding: "14px 20px",
                fontSize: 15,
              }}
            >
              🔍 スキャン開始（{images.length}枚）
            </button>
          )}

          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 8,
              background: T.bg,
              border: `1px solid ${T.border}`,
              fontSize: 11,
              color: T.muted,
              lineHeight: 1.7,
            }}
          >
            <strong>使い方：</strong>商品を撮影してスキャン。Geminiが商品を特定し、楽天・Yahoo!ショッピングの参考価格を表示します。
            ヤフオク・メルカリは検索リンクで確認。最大5枚まで。
          </div>
        </div>
      )}

      {activeTab === "checker" && phase === "scanning" && (
        <div
          style={{
            marginTop: 20,
            padding: "40px 20px",
            borderRadius: T.radius + 4,
            background: T.surface,
            border: `1px solid ${T.border}`,
            textAlign: "center",
            animation: "fadeUp .3s ease",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: `3px solid ${T.border}`,
              borderTopColor: T.accent,
              borderRadius: "50%",
              animation: "spin .7s linear infinite",
              margin: "0 auto 16px",
            }}
          />
          <div style={{ fontSize: 15, fontWeight: 600 }}>スキャン中</div>
          {log && (
            <div style={{ fontSize: 11, color: T.muted, marginTop: 8, fontFamily: T.mono }}>{log}</div>
          )}
        </div>
      )}

      {activeTab === "checker" && phase === "result" && products.length > 0 && (
        <div style={{ marginTop: 20, animation: "fadeUp .3s ease" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={reset} style={{ ...btnStyle(T.surface, T.text, T.border), flex: 1 }}>
              ← 新規スキャン
            </button>
            <button type="button" onClick={reset} style={{ ...btnStyle(T.accentBg, T.accent, `${T.accent}33`), flex: 1 }}>
              📸 別の商品
            </button>
          </div>

          {barcodes.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <BarcodeResult code={barcodes[0].value} format={barcodes[0].format} />
            </div>
          )}

          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              prices={pricesByProduct[p.id]}
              pricesLoading={Boolean(pricesLoadingByProduct[p.id])}
              similar={similarByProduct[p.id]}
              similarLoading={Boolean(similarLoadingByProduct[p.id])}
              excluded={Boolean(excludedProductIds[p.id])}
              onEdit={(q) => handleEditQuery(p.id, q)}
              onRefreshPrices={() => loadPrices(p.id, p.searchQuery, p.brand)}
              onFetchSimilar={() => loadSimilar(p)}
              onApplySimilarSearch={(q) => handleApplySimilarSearch(p.id, q)}
              onToggleExclude={(next) => setExcludedProductIds((prev) => ({ ...prev, [p.id]: next }))}
            />
          ))}
        </div>
      )}

      {activeTab === "checker" && history.length > 0 && phase === "input" && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>履歴（{history.length}件）</span>
            <button
              type="button"
              onClick={() => {
                clearHistory().then(() => setHistory([]));
              }}
              style={{ background: "none", border: "none", color: T.danger, fontSize: 11, cursor: "pointer" }}
            >
              クリア
            </button>
          </div>
          {history.map((h) => (
            <HistoryItem
              key={h.id}
              item={h}
              onClick={() => {
                const restored = { ...h.product, id: crypto.randomUUID() };
                setProducts([restored]);
                setPricesByProduct({});
                setSimilarByProduct({});
                setExcludedProductIds({});
                setBarcodes(h.product.jan ? [{ value: h.product.jan, format: "ean_13" }] : []);
                setPhase("result");
                loadPrices(restored.id, restored.searchQuery, restored.brand);
              }}
            />
          ))}
        </div>
      )}

      {activeTab === "checker" && phase === "input" && <ApiStatus />}

      {activeTab === "insights" && (
        <Suspense
          fallback={
            <div style={{ marginTop: 16, fontSize: 12, color: T.muted, textAlign: "center" }}>
              集計リスト画面を読み込み中...
            </div>
          }
        >
          <InsightsPanel
            key={`${watchlistDraft?.query || "empty"}:${watchlistDraft?.name || ""}`}
            initialName={watchlistDraft?.name}
            initialQuery={watchlistDraft?.query}
            initialCategory={watchlistDraft?.category}
          />
        </Suspense>
      )}
      <div
        style={{
          marginTop: 24,
          padding: "14px 0",
          borderTop: `1px solid ${T.border}`,
          fontSize: 10,
          color: T.muted,
          textAlign: "center",
          lineHeight: 1.7,
        }}
      >
        相場チェッカー MVP — Gemini特定 / 楽天・Yahoo!ショッピングAPI
        <br />
        ヤフオク・メルカリは検索リンク
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: T.bg,
          borderTop: `1px solid ${T.border}`,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          marginTop: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("checker")}
          style={{
            border: "none",
            background: "none",
            padding: "10px 6px",
            color: activeTab === "checker" ? T.accent : T.muted,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          🔎 チェッカー
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("insights")}
          style={{
            border: "none",
            background: "none",
            padding: "10px 6px",
            color: activeTab === "insights" ? T.accent : T.muted,
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          📊 集計リスト
        </button>
      </div>
    </div>
  );
}
