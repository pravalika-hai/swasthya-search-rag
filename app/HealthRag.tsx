"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChatCircleDots,
  CheckCircle,
  ClockCounterClockwise,
  Database,
  Info,
  PaperPlaneTilt,
  Plus,
  ShieldCheck,
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

export default function HealthRag() {
  const [data, setData] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState(starterQuery);
  const [results, setResults] = useState<Medicine[]>([]);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([
    { id: 1, query: starterQuery, createdAt: "Current conversation" },
  ]);
  const [showRecent, setShowRecent] = useState(false);
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
      const saved = window.localStorage.getItem("swasthya-recent-chats");
      if (saved) setRecentChats(JSON.parse(saved));
    } catch {
      // Continue with session history when browser storage is unavailable.
    }
  }, []);

  function ask(nextQuery: string) {
    const clean = nextQuery.trim();
    if (!clean || !data.length) return;
    setActiveQuery(clean);
    setResults(retrieve(data, clean));
    setSelectedRow(null);
    setQuery("");
    setShowRecent(false);
    setRecentChats((current) => {
      const next = [
        { id: Date.now(), query: clean, createdAt: "Just now" },
        ...current.filter((chat) => chat.query !== clean),
      ].slice(0, 8);
      try {
        window.localStorage.setItem("swasthya-recent-chats", JSON.stringify(next));
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
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const emergency = emergencyTerms.some((term) => normalise(activeQuery).includes(term));
  const answer = results.length
    ? `I found ${results.length} relevant rows in your tablet-and-disease dataset. The matches below are connected to “${results[0].disease}”. They are reference results only, not a diagnosis or a recommendation to take a medicine.`
    : "I couldn’t find a confident match in the supplied dataset. Try naming a diagnosed condition, symptom category, or part of a tablet name.";

  return (
    <main className="chat-app">
      <header className="chat-topbar">
        <div className="chat-brand">
          <span className="brand-icon"><Plus size={20} weight="bold" /></span>
          <strong>Swasthya Search</strong>
        </div>
        <div className="topbar-actions">
          <span className="dataset-status"><span /> 980-row CSV connected</span>
          <button type="button" onClick={() => setShowRecent(true)}><ClockCounterClockwise size={18} /> Recent chats</button>
          <button type="button" onClick={newChat}><ChatCircleDots size={18} /> New chat</button>
        </div>
      </header>

      {showRecent && (
        <>
          <button className="drawer-backdrop" type="button" aria-label="Close recent conversations" onClick={() => setShowRecent(false)} />
          <aside className="recent-drawer" aria-label="Recent conversations">
            <header>
              <div>
                <span>CHAT HISTORY</span>
                <h2>Recent conversations</h2>
              </div>
              <button type="button" aria-label="Close recent conversations" onClick={() => setShowRecent(false)}><X size={20} /></button>
            </header>
            <div className="recent-chat-list">
              {recentChats.length ? recentChats.map((chat) => (
                <button className={chat.query === activeQuery ? "current" : ""} key={chat.id} type="button" onClick={() => ask(chat.query)}>
                  <ChatCircleDots size={19} />
                  <span><strong>{chat.query}</strong><small>{chat.query === activeQuery ? "Open now" : chat.createdAt}</small></span>
                  <ArrowRight size={16} />
                </button>
              )) : (
                <div className="recent-empty"><ChatCircleDots size={30} /><p>Your questions will appear here.</p></div>
              )}
            </div>
            <button className="drawer-new-chat" type="button" onClick={() => { newChat(); setShowRecent(false); }}><Plus size={17} /> Start a new chat</button>
          </aside>
        </>
      )}

      <section className="chat-scroll">
        <div className="chat-column">
          {!activeQuery ? (
            <section className="chat-welcome">
              <span className="welcome-icon"><Database size={30} weight="duotone" /></span>
              <h1>How can I help with your dataset?</h1>
              <p>Ask about a disease or tablet name. I’ll retrieve matching rows and explain them in one conversation.</p>
              <div className="suggestion-grid">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => ask(suggestion)}>{suggestion}<ArrowRight size={16} /></button>
                ))}
              </div>
            </section>
          ) : (
            <div className="messages">
              <article className="chat-message user">
                <div className="message-avatar user-avatar">You</div>
                <div className="message-body"><p>{activeQuery}</p></div>
              </article>

              <article className="chat-message assistant">
                <div className="message-avatar assistant-avatar"><Plus size={17} weight="bold" /></div>
                <div className="message-body">
                  <strong className="assistant-name">Swasthya</strong>
                  <p>{loading ? "Reading the supplied CSV…" : answer}</p>

                  <div className={emergency ? "chat-safety urgent" : "chat-safety"}>
                    <Info size={20} weight="fill" />
                    <div>
                      <strong>{emergency ? "Please get urgent help" : "Not a prescription"}</strong>
                      <p>{emergency ? "Call India’s emergency number 112 or go to the nearest emergency department." : "A clinician or pharmacist must confirm which medicine, strength, and dose—if any—is appropriate for you."}</p>
                    </div>
                  </div>

                  {!emergency && results.length > 0 && (
                    <section className="inline-results">
                      <div className="results-heading">
                        <div>
                          <span>RETRIEVED FROM YOUR CSV</span>
                          <h2>Matching tablet rows</h2>
                        </div>
                        <strong>{results.length} matches</strong>
                      </div>

                      <div className="price-note"><Info size={17} weight="fill" /> Prices are not included in this dataset.</div>

                      <div className="result-list">
                        {results.map((medicine, index) => (
                          <article className="result-row" key={`${medicine.row}-${medicine.name}`}>
                            <span className="result-number">{String(index + 1).padStart(2, "0")}</span>
                            <div className="result-copy">
                              <h3>{medicine.name}</h3>
                              <p><CheckCircle size={15} weight="fill" /> {medicine.disease}</p>
                              {selectedRow === medicine.row && (
                                <div className="result-detail">Source: healthcare_tablet_and_disease_only.csv · Row #{medicine.row}</div>
                              )}
                            </div>
                            <button type="button" onClick={() => setSelectedRow(selectedRow === medicine.row ? null : medicine.row)}>
                              {selectedRow === medicine.row ? "Close" : "Details"}
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {!emergency && (
                    <section className="chat-next-steps">
                      <h2>What to do next</h2>
                      <ul>
                        <li>Show these rows to a qualified clinician or pharmacist.</li>
                        <li>Share your symptoms, allergies, current medicines, and existing conditions.</li>
                        <li>Do not start or stop a medicine based only on this result.</li>
                      </ul>
                    </section>
                  )}
                </div>
              </article>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>
      </section>

      <footer className="composer-dock">
        <form className="chat-composer" onSubmit={submit}>
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
            placeholder="Message Swasthya Search"
            rows={1}
            disabled={loading}
            aria-label="Health question"
          />
          <button type="submit" disabled={loading || !query.trim()} aria-label="Send question"><PaperPlaneTilt size={19} weight="fill" /></button>
        </form>
        <p><ShieldCheck size={15} /> Dataset reference only. Confirm treatment decisions with a clinician.</p>
      </footer>
    </main>
  );
}
