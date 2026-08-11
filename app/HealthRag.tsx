"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  ClockCounterClockwise,
  FilePdf,
  GearSix,
  PaperPlaneTilt,
  Plus,
  SidebarSimple,
  X,
} from "@phosphor-icons/react";

type MedicalRecord = {
  id: number;
  title: string;
  page: number;
  overview: string;
  medicine: string;
  suggestions: string;
  searchText: string;
};

type MedicalDataset = {
  source: string;
  pageCount: number;
  recordCount: number;
  records: MedicalRecord[];
};

type RecentChat = {
  id: number;
  query: string;
  createdAt: string;
};

const starterQuery = "What does the PDF say about high blood pressure?";

const starterChats: RecentChat[] = [
  { id: 1, query: starterQuery, createdAt: "Just now" },
  { id: 2, query: "What are the suggestions for diabetes?", createdAt: "Yesterday" },
  { id: 3, query: "What does the PDF say about dengue?", createdAt: "2 days ago" },
  { id: 4, query: "Show the medicine information for asthma", createdAt: "3 days ago" },
  { id: 5, query: "What are common migraine symptoms?", createdAt: "5 days ago" },
];

const suggestions = [
  "What does the PDF say about diabetes?",
  "Show suggestions for fever",
  "What medicine information is listed for asthma?",
];

const stopWords = new Set([
  "a", "about", "an", "and", "are", "does", "for", "from", "give", "have", "i",
  "in", "information", "is", "it", "listed", "me", "medical", "medicine", "of",
  "on", "or", "pdf", "say", "show", "suggestion", "suggestions", "the", "to",
  "what", "which", "with",
]);

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getTokens(value: string) {
  return normalise(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function retrieve(data: MedicalRecord[], query: string) {
  const queryText = normalise(query);
  let queryTokens = getTokens(query);
  let explicitAlias = false;

  if (queryText.includes("high blood pressure")) { queryTokens.push("hypertension"); explicitAlias = true; }
  if (queryText.includes("high blood sugar") || queryText.includes("blood glucose")) { queryTokens.push("diabetes"); explicitAlias = true; }
  if (queryText.includes("heart attack")) { queryTokens.push("coronary", "artery", "disease"); explicitAlias = true; }
  if (queryText.includes("stomach pain") || queryText.includes("acidity")) queryTokens.push("gastritis", "acidity");
  queryTokens = [...new Set(queryTokens)];

  const ranked = data
    .map((record) => {
      const title = normalise(record.title);
      const overview = normalise(record.overview);
      const medicine = normalise(record.medicine);
      const suggestionsText = normalise(record.suggestions);
      let score = 0;
      queryTokens.forEach((token) => {
        if (title === token) score += 20;
        if (title.includes(token)) score += 12;
        if (overview.includes(token)) score += 4;
        if (medicine.includes(token)) score += 3;
        if (suggestionsText.includes(token)) score += 2;
      });
      return { record, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.record.page - right.record.page)
    .slice(0, 4);

  const symptomTerms = new Set(["fever", "cough", "headache", "pain", "tired", "fatigue", "vomiting", "diarrhea", "rash", "swelling", "breathing", "dizzy", "nausea"]);
  const firstPerson = /\b(i have|i feel|i am feeling|my symptoms|suffering from)\b/.test(queryText);
  const describesSymptoms = firstPerson && queryTokens.some((token) => symptomTerms.has(token));
  const ambiguous = !explicitAlias && describesSymptoms && ranked.length > 1;

  return { matches: ranked.map(({ record }) => record), ambiguous };
}

function shortLine(value: string, maximum = 92) {
  const firstSentence = value.split(/(?<=[.!?])\s/)[0]?.trim() || value.trim();
  if (firstSentence.length <= maximum) return firstSentence;
  return `${firstSentence.slice(0, maximum - 3).trimEnd()}...`;
}

export default function HealthRag() {
  const [dataset, setDataset] = useState<MedicalDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState(starterQuery);
  const [results, setResults] = useState<MedicalRecord[]>([]);
  const [ambiguous, setAmbiguous] = useState(false);
  const [recentChats, setRecentChats] = useState<RecentChat[]>(starterChats);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/data/medical-info.json")
      .then((response) => {
        if (!response.ok) throw new Error("PDF dataset could not be loaded");
        return response.json() as Promise<MedicalDataset>;
      })
      .then((nextDataset) => {
        setDataset(nextDataset);
        const initial = retrieve(nextDataset.records, starterQuery);
        setResults(initial.matches);
        setAmbiguous(initial.ambiguous);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("medsearch-pdf-recent-chats");
      if (saved) setRecentChats(JSON.parse(saved));
    } catch {
      // Session history remains available when browser storage is unavailable.
    }
  }, []);

  function ask(nextQuery: string) {
    const clean = nextQuery.trim();
    if (!clean || !dataset) return;
    const retrieval = retrieve(dataset.records, clean);
    setActiveQuery(clean);
    setResults(retrieval.matches);
    setAmbiguous(retrieval.ambiguous);
    setQuery("");
    setMobileSidebarOpen(false);
    setRecentChats((current) => {
      const next = [
        { id: Date.now(), query: clean, createdAt: "Just now" },
        ...current.filter((chat) => chat.query !== clean),
      ].slice(0, 8);
      try {
        window.localStorage.setItem("medsearch-pdf-recent-chats", JSON.stringify(next));
      } catch {
        // History still works for this session.
      }
      return next;
    });
    requestAnimationFrame(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(query);
  }

  function newChat() {
    setActiveQuery("");
    setResults([]);
    setAmbiguous(false);
    setQuery("");
    setMobileSidebarOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const asksForMedicine = /\b(medicine|medicines|tablet|tablets|drug|drugs)\b/.test(normalise(activeQuery));
  const medicineLine = results[0]?.medicine && !results[0].medicine.startsWith("Consult a qualified")
    ? shortLine(results[0].medicine)
    : "The document does not name a specific medicine for this condition.";
  const answerLines = loading
    ? ["Reading the medical information...", "Please wait a moment."]
    : ambiguous
      ? [
          "These symptoms could match multiple conditions in the document.",
          "The available information is insufficient to identify one condition.",
        ]
      : results.length
      ? [
          shortLine(results[0].overview),
          asksForMedicine ? medicineLine : shortLine(results[0].suggestions),
        ]
      : [
          "I couldn't find information about this condition in the provided medical document.",
          "\u00a0",
        ];

  const sidebarClass = [
    "history-sidebar",
    sidebarOpen ? "" : "is-collapsed",
    mobileSidebarOpen ? "is-mobile-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <main className={sidebarOpen ? "medsearch-app" : "medsearch-app sidebar-collapsed"}>
      {mobileSidebarOpen && (
        <button className="mobile-scrim" type="button" aria-label="Close recent chats" onClick={() => setMobileSidebarOpen(false)} />
      )}

      <aside className={sidebarClass} aria-label="Recent conversations">
        <header className="sidebar-brand-row">
          <div className="app-brand">
            <span className="brand-mark"><Plus size={20} weight="bold" /></span>
            <strong>MedSearch</strong>
          </div>
          <button className="sidebar-close-mobile" type="button" aria-label="Close recent chats" onClick={() => setMobileSidebarOpen(false)}><X size={20} /></button>
          <button className="sidebar-collapse" type="button" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} onClick={() => setSidebarOpen((value) => !value)}>
            {sidebarOpen ? <CaretDoubleLeft size={18} /> : <CaretDoubleRight size={18} />}
          </button>
        </header>

        <button className="primary-new-chat" type="button" onClick={newChat}><Plus size={20} /> <span>New chat</span></button>

        <div className="history-content">
          <span className="section-label">RECENT</span>
          <nav className="history-list" aria-label="Recent chats">
            {recentChats.map((chat) => (
              <button className={chat.query === activeQuery ? "history-item is-current" : "history-item"} key={chat.id} type="button" onClick={() => ask(chat.query)} title={chat.query}>
                <ChatCircleDots size={21} />
                <span><strong>{chat.query}</strong><small>{chat.query === activeQuery ? "Open now" : chat.createdAt}</small></span>
              </button>
            ))}
          </nav>
        </div>

        <button className="settings-button" type="button" onClick={() => setSettingsOpen(true)}><GearSix size={21} /> <span>Settings</span></button>
      </aside>

      <section className="workspace">
        <header className="workspace-topbar">
          <button className="mobile-menu-button" type="button" aria-label="Open recent chats" onClick={() => setMobileSidebarOpen(true)}><SidebarSimple size={20} /></button>
          <div className="mobile-brand app-brand"><span className="brand-mark"><Plus size={18} weight="bold" /></span><strong>MedSearch</strong></div>
          <div className="topbar-actions">
            <span className="dataset-status"><CheckCircle size={16} weight="fill" /> {dataset?.pageCount || 23}-page PDF connected</span>
            <button type="button" onClick={() => setMobileSidebarOpen(true)}><ClockCounterClockwise size={18} /> <span>Recent chats</span></button>
            <button type="button" onClick={newChat}><ChatCircleDots size={18} /> <span>New chat</span></button>
          </div>
        </header>

        <section className="conversation-scroll">
          <div className="conversation-column">
            {!activeQuery ? (
              <section className="welcome-panel">
                <span className="welcome-icon"><FilePdf size={30} weight="duotone" /></span>
                <span className="eyebrow">MEDSEARCH PDF ASSISTANT</span>
                <h1>What would you like to know?</h1>
                <p>Ask about a condition or symptom. MedSearch retrieves matching guidance from your supplied medical PDF.</p>
                <div className="suggestion-list">
                  {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)}>{suggestion}<CaretRight size={16} /></button>)}
                </div>
              </section>
            ) : (
              <div className="conversation">
                <article className="question-row message-enter">
                  <p>{activeQuery}</p>
                  <span className="user-avatar">You</span>
                </article>

                <article className="answer-row message-enter answer-delay">
                  <span className="assistant-avatar"><Plus size={18} weight="bold" /></span>
                  <div className="answer-content">
                    <p className="two-line-answer"><span>{answerLines[0]}</span><span>{answerLines[1]}</span></p>
                  </div>
                </article>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        </section>

        <footer className="composer-area">
          <form className="message-composer" onSubmit={submit}>
            <textarea ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value.slice(0, 500))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (query.trim()) ask(query); } }} placeholder="Message MedSearch" rows={1} disabled={loading} aria-label="Health question" />
            <button type="submit" disabled={loading || !query.trim()} aria-label="Send question"><PaperPlaneTilt size={20} weight="fill" /></button>
          </form>
        </footer>
      </section>

      {settingsOpen && (
        <div className="settings-layer" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><h2 id="settings-title">MedSearch settings</h2><button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={19} /></button></header>
            <div className="settings-row"><span><strong>Motion</strong><small>Follows your system's reduced-motion preference.</small></span><CheckCircle size={22} weight="fill" /></div>
            <div className="settings-row"><span><strong>Dataset</strong><small>medical info.pdf - {dataset?.recordCount || 58} searchable sections</small></span><FilePdf size={22} weight="fill" /></div>
          </section>
        </div>
      )}
    </main>
  );
}
