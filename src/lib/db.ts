import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isSampleWatchlistId } from "./sampleAggregationData";
import type { AggregationReport, HistoryEntry, WatchlistItem } from "../types";

interface SoubaDB extends DBSchema {
  history: {
    key: string;
    value: HistoryEntry;
    indexes: { "by-timestamp": number };
  };
  watchlist: {
    key: string;
    value: WatchlistItem;
    indexes: { "by-createdAt": number; "by-lastAggregatedAt": number };
  };
  reports: {
    key: string;
    value: AggregationReport;
    indexes: { "by-runAt": number; "by-watchlistId": string };
  };
}

const DB_NAME = "souba-checker";
const FALLBACK_DB_NAME = "souba-checker-recovery";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<SoubaDB>> | null = null;

function openSoubaDb(dbName: string) {
  return openDB<SoubaDB>(dbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("history")) {
        const store = db.createObjectStore("history", { keyPath: "id" });
        store.createIndex("by-timestamp", "timestamp");
      }
      if (!db.objectStoreNames.contains("watchlist")) {
        const store = db.createObjectStore("watchlist", { keyPath: "id" });
        store.createIndex("by-createdAt", "createdAt");
        store.createIndex("by-lastAggregatedAt", "lastAggregatedAt");
      }
      if (!db.objectStoreNames.contains("reports")) {
        const store = db.createObjectStore("reports", { keyPath: "id" });
        store.createIndex("by-runAt", "runAt");
        store.createIndex("by-watchlistId", "watchlistId");
      }
    },
    blocked() {
    },
    blocking() {
    },
    terminated() {
    },
  });
}

function getDB() {
  if (!dbPromise) {
    const openPromise = openSoubaDb(DB_NAME);
    const timeoutMs = 8000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<IDBPDatabase<SoubaDB>>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("DB初期化がタイムアウトしました。他のタブを閉じて再読み込みしてください。"));
      }, timeoutMs);
    });
    dbPromise = Promise.race([openPromise, timeoutPromise])
      .catch(async (e) => {
        if (e instanceof Error && e.message.includes("DB初期化がタイムアウトしました")) {
          return await openSoubaDb(FALLBACK_DB_NAME);
        }
        dbPromise = null;
        throw e;
      })
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });

  }
  return dbPromise;
}

export async function loadHistory(limit = 30): Promise<HistoryEntry[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("history", "by-timestamp");
  return all.reverse().slice(0, limit);
}

export async function saveHistory(entry: HistoryEntry): Promise<void> {
  const db = await getDB();
  await db.put("history", entry);
  const all = await db.getAllKeys("history");
  if (all.length > 50) {
    const oldest = all.slice(0, all.length - 50);
    await Promise.all(oldest.map((key) => db.delete("history", key)));
  }
}

export async function clearHistory(): Promise<void> {
  const db = await getDB();
  await db.clear("history");
}

export async function loadWatchlist(): Promise<WatchlistItem[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("watchlist", "by-createdAt");
  return all.reverse();
}

export async function saveWatchlist(item: WatchlistItem): Promise<void> {
  const db = await getDB();
  await db.put("watchlist", item);
}

export async function deleteWatchlist(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("watchlist", id);
}

export async function loadReports(limit = 100): Promise<AggregationReport[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("reports", "by-runAt");
  return all.reverse().slice(0, limit);
}

export async function saveReport(report: AggregationReport): Promise<void> {
  const db = await getDB();
  await db.put("reports", report);
  const all = await db.getAllKeys("reports");
  if (all.length > 300) {
    const oldest = all.slice(0, all.length - 300);
    await Promise.all(oldest.map((key) => db.delete("reports", key)));
  }
}

export async function clearSampleAggregationData(): Promise<void> {
  const db = await getDB();
  const watchlist = await db.getAll("watchlist");
  await Promise.all(
    watchlist.filter((w) => isSampleWatchlistId(w.id)).map((w) => db.delete("watchlist", w.id)),
  );
  const reports = await db.getAll("reports");
  await Promise.all(
    reports.filter((r) => isSampleWatchlistId(r.watchlistId)).map((r) => db.delete("reports", r.id)),
  );
}

export async function seedSampleAggregationData(
  watchlist: WatchlistItem[],
  reports: AggregationReport[],
): Promise<void> {
  await clearSampleAggregationData();
  const db = await getDB();
  await Promise.all(watchlist.map((w) => db.put("watchlist", w)));
  await Promise.all(reports.map((r) => db.put("reports", r)));
}
