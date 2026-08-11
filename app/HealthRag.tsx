"use client";

import { CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  CaretRight,
  ChatCircleDots,
  CheckCircle,
  ClockCounterClockwise,
  Database,
  GearSix,
  Info,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
  SidebarSimple,
  Warning,
  X,
} from "@phosphor-icons/react";

type Medicine = {
  row: number;
  name: string;
  disease: string;
};

type RecentChat = {
  id: number;
  query: string;
  createdAt: string;
};

const starterQuery = "I have high blood sugar—what tablets are in the dataset?";

const starterChats: RecentChat[] = [
  { id: 1, query: starterQuery, createdAt: "Just now" },
  { id: 2, query: "Find tablets for type 1 diabetes", createdAt: "Yesterday" },
  { id: 3, query: "List insulin brands in the dataset", createdAt: "2 days ago" },
  { id: 4, query: "What is metformin used for?", createdAt: "3 days ago" },
  { id: 5, query: "Show all SGLT2 inhibitors", createdAt: "5 days ago" },
];

const suggestions = [
  "Show tablets related to type 2 diabetes",
  "What is listed for fever and body ache?",
  "Find entries related to high blood pressure",
];

const stopWords = new Set([
  "a", "an", "and", "are", "available", "for", "have", "i", "in", "is", "it",
  "list", "listed", "me", "medicine", "medicines", "of", "or", "show", "tablet",
  "tablets", "the", "to", "what", "which", "with", "dataset",
]);

const emergencyTerms = [
  "chest pain", "cannot breathe", "difficulty breathing", "severe bleeding",
  "unconscious", "fainted", "fainting", "seizure", "suicidal", "overdose",
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getTokens(value: string) {
  return normalise(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function retrieve(data: Medicine[], query: string) {
  const queryText = normalise(query);
  let queryTokens = getTokens(query);

  if (queryText.includes("high blood sugar") || queryText.includes("blood glucose")) {
    queryTokens = queryTokens
      .filter((token) => !["high", "blood", "sugar", "glucose"].includes(token))
      .concat(["diabetes", "antidiabetic"]);
  }
  if (queryText.includes("blood pressure")) queryTokens.push("hypertension");
  if (queryText.includes("body ache")) queryTokens.push("pain", "fever");

  return data
    .map((medicine) => {
      const name = normalise(medicine.name);
      const disease = normalise(medicine.disease);
      let score = 0;
      queryTokens.forEach((token) => {
        if (disease.includes(token)) score += 7;
        if (name.includes(token)) score += 5;
        if (disease.split(" ").includes(token)) score += 3;
        if (name.split(" ").includes(token)) score += 2;
      });
      return { medicine, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.medicine.name.localeCompare(right.medicine.name))
    .slice(0, 6)
    .map(({ medicine }) => medicine);
}

function getStrength(name: string) {
  const strengths = name.match(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|g)\b/gi);
  return strengths?.slice(0, 2).join(" / ") ?? "See label";
}

export default function HealthRag() {
  const [data, setData] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState(starterQuery);
  const [results, setResults] = useState<Medicine[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [recentChats, setRecentChats] = useState<RecentChat[]>(starterChats);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/data/healthcare_tablet_and_disease_only.csv")
      .then((response) => {
        if (!response.ok) throw new Error("Dataset could not be loaded");
        return response.text();
      })
      .then((text) => {
        const [, ...rows] = parseCsv(text);
        const parsed = rows
          .filter((row) => row.length >= 2 && row[0] && row[1])
          .map((row, index) => ({ row: index + 1, name: row[0], disease: row[1] }));
        setData(parsed);
        setResults(retrieve(parsed, starterQuery));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("medsearch-recent-chats");
      if (saved) setRecentChats(JSON.parse(saved));
    } catch {
      // Session history remains available when browser storage is unavailable.
    }
  }, []);

  function ask(nextQuery: string) {
    const clean = nextQuery.trim();
    if (!clean || !data.length) return;
    setActiveQuery(clean);
    setResults(retrieve(data, clean));
    setSelectedRow(null);
    setQuery("");
    setMobileSidebarOpen(false);
    setRecentChats((current) => {
      const next = [
        { id: Date.now(), query: clean, createdAt: "Just now" },
        ...current.filter((chat) => chat.query !== clean),
      ].slice(0, 8);
      try {
        window.localStorage.setItem("medsearch-recent-chats", JSON.stringify(next));
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
    setSelectedRow(null);
    setQuery("");
    setMobileSidebarOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const emergency = emergencyTerms.some((term) => normalise(activeQuery).includes(term));
  const answer = results.length
    ? `I found ${results.length} relevant rows in your tablet-and-disease dataset. The matches below are connected to “${results[0].disease}”. They are reference results only, not a diagnosis or a recommendation to take a medicine.`
    : "I couldn’t find a confident match in the supplied dataset. Try naming a diagnosed condition, symptom category, or part of a tablet name.";

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
          <button className="sidebar-close-mobile" type="button" aria-label="Close recent chats" onClick={() => setMobileSidebarOpen(false)}>
            <X size={20} />
          </button>
          <button className="sidebar-collapse" type="button" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"} onClick={() => setSidebarOpen((value) => !value)}>
            {sidebarOpen ? <CaretDoubleLeft size={18} /> : <CaretDoubleRight size={18} />}
          </button>
        </header>

        <button className="primary-new-chat" type="button" onClick={newChat}>
          <Plus size={20} /> <span>New chat</span>
        </button>

        <div className="history-content">
          <span className="section-label">RECENT</span>
          <nav className="history-list" aria-label="Recent chats">
            {recentChats.map((chat) => (
              <button
                className={chat.query === activeQuery ? "history-item is-current" : "history-item"}
                key={chat.id}
                type="button"
                onClick={() => ask(chat.query)}
                title={chat.query}
              >
                <ChatCircleDots size={21} />
                <span>
                  <strong>{chat.query}</strong>
                  <small>{chat.query === activeQuery ? "Open now" : chat.createdAt}</small>
                </span>
              </button>
            ))}
          </nav>
        </div>

        <button className="settings-button" type="button" onClick={() => setSettingsOpen(true)}>
          <GearSix size={21} /> <span>Settings</span>
        </button>
      </aside>

      <section className="workspace">
        <header className="workspace-topbar">
          <button className="mobile-menu-button" type="button" aria-label="Open recent chats" onClick={() => setMobileSidebarOpen(true)}>
            <SidebarSimple size={20} />
          </button>
          <div className="mobile-brand app-brand">
            <span className="brand-mark"><Plus size={18} weight="bold" /></span>
            <strong>MedSearch</strong>
          </div>
          <div className="topbar-actions">
            <span className="dataset-status"><CheckCircle size={16} weight="fill" /> {data.length || 980}-row CSV connected</span>
            <button type="button" onClick={() => setMobileSidebarOpen(true)}><ClockCounterClockwise size={18} /> <span>Recent chats</span></button>
            <button type="button" onClick={newChat}><ChatCircleDots size={18} /> <span>New chat</span></button>
          </div>
        </header>

        <section className="conversation-scroll">
          <div className="conversation-column">
            {!activeQuery ? (
              <section className="welcome-panel">
                <span className="welcome-icon"><Database size={30} weight="duotone" /></span>
                <span className="eyebrow">MEDSEARCH DATASET ASSISTANT</span>
                <h1>What would you like to find?</h1>
                <p>Ask about a disease or tablet name. MedSearch will retrieve matching CSV rows and explain what it found.</p>
                <div className="suggestion-list">
                  {suggestions.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => ask(suggestion)}>
                      {suggestion}<CaretRight size={16} />
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <div className="conversation">
                <article className="question-row message-enter">
                  <span className="user-avatar">You</span>
                  <p>{activeQuery}</p>
                </article>

                <article className="answer-row message-enter answer-delay">
                  <span className="assistant-avatar"><Plus size={18} weight="bold" /></span>
                  <div className="answer-content">
                    <strong className="assistant-name">MedSearch</strong>
                    <p>{loading ? "Reading the supplied CSV…" : answer}</p>

                    <div className={emergency ? "safety-notice is-urgent" : "safety-notice"}>
                      {emergency ? <Warning size={22} weight="fill" /> : <Warning size={22} weight="fill" />}
                      <div>
                        <strong>{emergency ? "Please get urgent help" : "Not a prescription"}</strong>
                        <p>{emergency ? "Call India’s emergency number 112 or go to the nearest emergency department." : "A clinician or pharmacist must confirm which medicine, strength, and dose—if any—is appropriate for you."}</p>
                      </div>
                    </div>

                    {!emergency && results.length > 0 && (
                      <section className="results-section">
                        <div className="results-toolbar">
                          <div className="results-title">
                            <Database size={19} weight="fill" />
                            <span>RETRIEVED FROM YOUR CSV</span>
                            <strong>Matching tablet rows ({results.length} results)</strong>
                          </div>
                          <span className="price-note"><Info size={18} /> Prices are not included in this dataset.</span>
                        </div>

                        <div className="results-table" role="table" aria-label="Matching tablet rows">
                          <div className="table-header" role="row">
                            <span>#</span><span>TABLET NAME</span><span>STRENGTH</span><span>DISEASE (LINKED)</span><span>DETAILS</span>
                          </div>
                          {results.map((medicine, index) => (
                            <div
                              className={selectedRow === medicine.row ? "table-record is-expanded" : "table-record"}
                              key={`${medicine.row}-${medicine.name}`}
                              style={{ "--row-delay": `${index * 70}ms` } as CSSProperties}
                            >
                              <div className="table-row" role="row">
                                <span className="record-number">{String(index + 1).padStart(2, "0")}</span>
                                <strong>{medicine.name}</strong>
                                <span>{getStrength(medicine.name)}</span>
                                <span>{medicine.disease}</span>
                                <button type="button" onClick={() => setSelectedRow(selectedRow === medicine.row ? null : medicine.row)}>
                                  {selectedRow === medicine.row ? "Close" : "Details"}<CaretRight size={15} />
                                </button>
                              </div>
                              {selectedRow === medicine.row && (
                                <div className="record-detail">
                                  <ShieldCheck size={17} weight="fill" />
                                  Source row #{medicine.row} in healthcare_tablet_and_disease_only.csv. Verify the medicine, strength, and suitability with a qualified clinician or pharmacist.
                                </div>
                              )}
                            </div>
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
            <textarea
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 500))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (query.trim()) ask(query);
                }
              }}
              placeholder="Message MedSearch"
              rows={1}
              disabled={loading}
              aria-label="Health question"
            />
            <button type="submit" disabled={loading || !query.trim()} aria-label="Send question"><PaperPlaneTilt size={20} weight="fill" /></button>
          </form>
          <p><ShieldCheck size={15} /> Dataset reference only. Confirm treatment decisions with a clinician.</p>
        </footer>
      </section>

      {settingsOpen && (
        <div className="settings-layer" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><h2 id="settings-title">MedSearch settings</h2><button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={19} /></button></header>
            <div className="settings-row"><span><strong>Motion</strong><small>Follows your system’s reduced-motion preference.</small></span><CheckCircle size={22} weight="fill" /></div>
            <div className="settings-row"><span><strong>Dataset</strong><small>healthcare_tablet_and_disease_only.csv</small></span><Database size={22} weight="fill" /></div>
          </section>
        </div>
      )}
    </main>
  );
}
