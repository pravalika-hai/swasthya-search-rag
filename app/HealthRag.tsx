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
  Info,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  SidebarSimple,
  Warning,
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

const emergencyTerms = [
  "chest pain", "cannot breathe", "difficulty breathing", "severe bleeding",
  "unconscious", "fainted", "fainting", "seizure", "suicidal", "overdose",
];

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

  if (queryText.includes("high blood pressure")) queryTokens.push("hypertension");
  if (queryText.includes("high blood sugar") || queryText.includes("blood glucose")) queryTokens.push("diabetes");
  if (queryText.includes("heart attack")) queryTokens.push("coronary", "artery", "disease");
  if (queryText.includes("stomach pain") || queryText.includes("acidity")) queryTokens.push("gastritis", "acidity");
  queryTokens = [...new Set(queryTokens)];

  return data
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
    .slice(0, 4)
    .map(({ record }) => record);
}

function shorten(value: string, maximum = 340) {
  if (value.length <= maximum) return value;
  const clipped = value.slice(0, maximum);
  const sentence = clipped.lastIndexOf(". ");
  return `${clipped.slice(0, sentence > 170 ? sentence + 1 : maximum).trim()}...`;
}

export default function HealthRag() {
  const [dataset, setDataset] = useState<MedicalDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState(starterQuery);
  const [results, setResults] = useState<MedicalRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<number | null>(null);
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
        setResults(retrieve(nextDataset.records, starterQuery));
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
    setActiveQuery(clean);
    setResults(retrieve(dataset.records, clean));
    setSelectedRecord(null);
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
    setSelectedRecord(null);
    setQuery("");
    setMobileSidebarOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const emergency = emergencyTerms.some((term) => normalise(activeQuery).includes(term));
  const answer = results.length
    ? `I found ${results.length} relevant medical reference ${results.length === 1 ? "section" : "sections"} in the supplied PDF. The closest match is "${results[0].title}" on page ${results[0].page}.`
    : "I could not find a confident match in the supplied PDF. Try naming a condition, symptom, or topic such as diabetes, fever, asthma, or hypertension.";

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
                    <strong className="assistant-name">MedSearch</strong>
                    <p>{loading ? "Reading the supplied medical PDF..." : answer}</p>

                    <div className={emergency ? "safety-notice is-urgent" : "safety-notice"}>
                      <Warning size={22} weight="fill" />
                      <div>
                        <strong>{emergency ? "Please get urgent help" : "Medical information, not a diagnosis"}</strong>
                        <p>{emergency ? "Call India's emergency number 112 or go to the nearest emergency department." : "Use this PDF guidance as a reference. A qualified clinician must diagnose symptoms and choose any medicine or dose."}</p>
                      </div>
                    </div>

                    {!emergency && results.length > 0 && (
                      <section className="results-section">
                        <div className="results-toolbar">
                          <div className="results-title"><FilePdf size={19} weight="fill" /><span>RETRIEVED FROM YOUR PDF</span><strong>{results.length} matching references</strong></div>
                          <span className="price-note"><Info size={18} /> Medicine prices are not provided in this PDF.</span>
                        </div>

                        <div className="reference-list" aria-label="Matching PDF references">
                          {results.map((record, index) => (
                            <article className={selectedRecord === record.id ? "reference-card is-expanded" : "reference-card"} key={record.id}>
                              <button className="reference-main" type="button" onClick={() => setSelectedRecord(selectedRecord === record.id ? null : record.id)}>
                                <span className="record-number">{String(index + 1).padStart(2, "0")}</span>
                                <span className="reference-copy"><strong>{record.title}</strong><small>Page {record.page} of {dataset?.pageCount || 23}</small></span>
                                <span className="reference-action">{selectedRecord === record.id ? "Close" : "View guidance"}<CaretRight size={15} /></span>
                              </button>
                              <div className="reference-summary">
                                <p>{shorten(record.overview)}</p>
                                <div className="guidance-grid">
                                  <div><strong>Suggestions</strong><p>{shorten(record.suggestions, 260)}</p></div>
                                  <div><strong>Medicine information</strong><p>{shorten(record.medicine, 260)}</p></div>
                                </div>
                              </div>
                              {selectedRecord === record.id && (
                                <div className="record-detail"><ShieldCheck size={17} weight="fill" />Source: medical info.pdf, page {record.page}. Confirm any treatment or medicine decision with a qualified healthcare professional.</div>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
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
          <p><ShieldCheck size={15} /> PDF reference only. Confirm treatment decisions with a clinician.</p>
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
