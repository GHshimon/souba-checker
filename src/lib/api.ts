import type { IdentifyResponse, JanLookupResponse, PricesResponse, SimilarResponse } from "../types";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = 45000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    }).catch((e: unknown) => {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("API応答がタイムアウトしました。通信環境を確認して再試行してください。");
      }
      throw e;
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error((data as { error?: string }).error || `API error (${resp.status})`);
    }
    return data as T;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("APIレスポンスの処理に失敗しました");
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupJan(jan: string): Promise<JanLookupResponse> {
  return apiFetch<JanLookupResponse>("/api/jan", {
    method: "POST",
    body: JSON.stringify({ jan }),
  });
}

export async function identifyProduct(images: string[], jan?: string): Promise<IdentifyResponse> {
  return apiFetch<IdentifyResponse>("/api/identify", {
    method: "POST",
    body: JSON.stringify({ images, ...(jan ? { jan } : {}) }),
  });
}

export async function fetchSimilarProducts(input: {
  product_name: string;
  brand?: string;
  model?: string;
  category?: string;
  search_query?: string;
}): Promise<SimilarResponse> {
  return apiFetch<SimilarResponse>("/api/similar", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchPrices(query: string, maker?: string): Promise<PricesResponse> {
  return apiFetch<PricesResponse>("/api/prices", {
    method: "POST",
    body: JSON.stringify({ query, ...(maker ? { maker } : {}) }),
  });
}
