import Quagga from "@ericblade/quagga2";
import type { BarcodeResult } from "../types";

export function compressImage(file: File, maxSize = 800): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((ok, ng) => {
    const r = new FileReader();
    r.onerror = () => ng(new Error("読み込み失敗"));
    r.onload = (e) => {
      const img = new Image();
      img.onerror = () => ng(new Error("画像デコード失敗"));
      img.onload = () => {
        const cv = document.createElement("canvas");
        const s = Math.min(maxSize / img.width, maxSize / img.height, 1);
        cv.width = Math.round(img.width * s);
        cv.height = Math.round(img.height * s);
        cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
        ok({ dataUrl: cv.toDataURL("image/jpeg", 0.7), w: cv.width, h: cv.height });
      };
      img.src = e.target!.result as string;
    };
    r.readAsDataURL(file);
  });
}

export async function detectBarcodeNative(imageSrc: string): Promise<{ supported: boolean; codes: BarcodeResult[] }> {
  if (!("BarcodeDetector" in window)) {
    return { supported: false, codes: [] };
  }
  try {
    const img = new Image();
    await new Promise<void>((ok, ng) => {
      img.onload = () => ok();
      img.onerror = ng;
      img.src = imageSrc;
    });
    const detector = new window.BarcodeDetector!({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
    });
    const results = await detector.detect(img);
    return {
      supported: true,
      codes: results.map((r) => ({ value: r.rawValue, format: r.format })),
    };
  } catch {
    return { supported: true, codes: [] };
  }
}

export function detectBarcodeQuagga(imageSrc: string): Promise<BarcodeResult[]> {
  return new Promise((resolve) => {
    Quagga.decodeSingle(
      {
        src: imageSrc,
        numOfWorkers: 0,
        inputStream: { size: 800 },
        decoder: {
          readers: ["ean_reader", "ean_8_reader", "upc_reader", "code_128_reader", "code_39_reader"],
        },
        locate: true,
      },
      (result) => {
        if (result?.codeResult?.code) {
          resolve([{ value: result.codeResult.code, format: result.codeResult.format || "unknown" }]);
        } else {
          resolve([]);
        }
      },
    );
  });
}

export async function detectBarcode(imageSrc: string): Promise<BarcodeResult[]> {
  const native = await detectBarcodeNative(imageSrc);
  if (native.codes.length > 0) return native.codes;
  return detectBarcodeQuagga(imageSrc);
}

export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(",")[1] ?? dataUrl;
}
