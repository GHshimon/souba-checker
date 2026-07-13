const STORAGE_KEY = "souba_last_research";

export type ResearchDraft = {
  name: string;
  query: string;
  category: string;
};

export function saveResearchDraft(draft: ResearchDraft) {
  if (!draft.query.trim()) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function loadResearchDraft(): ResearchDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResearchDraft>;
    if (!parsed.query?.trim()) return null;
    return {
      name: parsed.name?.trim() || parsed.query.trim(),
      query: parsed.query.trim(),
      category: parsed.category?.trim() || "未分類",
    };
  } catch {
    return null;
  }
}

export function clearResearchDraft() {
  sessionStorage.removeItem(STORAGE_KEY);
}
