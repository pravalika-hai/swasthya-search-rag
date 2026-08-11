"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Medicine = {
  record: string;
  code: string;
  name: string;
  condition: string;
  category: string;
  pack: string;
  price: number;
  basis: string;
  source: string;
  accessed: string;
};

const prompts = [
  "I have high blood sugar—what is in the list under ₹100?",
  "What catalogue entries relate to high blood pressure?",
  "What is the listed price of Acarbose and Metformin?",
];

const emergencyTerms = [
  "chest pain", "cannot breathe", "difficulty breathing", "severe bleeding",
  "unconscious", "fainted", "fainting", "seizure", "suicidal", "overdose",
];

const stopWords = new Set([
  "a", "an", "and", "are", "available", "below", "for", "in", "is", "me",
  "medicine", "medicines", "of", "or", "show", "tablet", "tablets", "the",
  "to", "under", "what", "which", "with", "price", "prices", "cost",
]);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalise(value)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token));
}

function retrieve(data: Medicine[], query: string) {
  const queryTokens = tokens(query);
  const priceMatch = query.match(/(?:under|below|less than|up to|within)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)/i);
  const budget = priceMatch ? Number(priceMatch[1]) : null;
  const codeMatch = query.match(/(?:code|pmbjp)\s*#?\s*(\d+)/i);
  const exactPhrase = normalise(query);

  return data
    .map((item) => {
      const name = normalise(item.name);
      const condition = normalise(item.condition);
      const category = normalise(item.category);
      const haystack = `${name} ${condition} ${category} ${item.code}`;
      let score = 0;

      queryTokens.forEach((token) => {
        if (name.includes(token)) score += 6;
        if (condition.includes(token)) score += 4;
        if (category.includes(token)) score += 3;
        if (haystack.split(" ").includes(token)) score += 2;
      });
      if (exactPhrase.length > 4 && haystack.includes(exactPhrase)) score += 12;
      if (codeMatch?.[1] === item.code) score += 30;
      if (budget !== null && item.price <= budget) score += 2;
      if (budget !== null && item.price > budget) score -= 20;

      return { item, score };
    })
    .filter(({ score, item }) => score > 0 && (budget === null || item.price <= budget))
    .sort((a, b) => b.score - a.score || a.item.price - b.item.price)
    .slice(0, 6)
    .map(({ item }) => item);
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(price);
}

export default function HealthRag() {
  const [data, setData] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [results, setResults] = useState<Medicine[]>([]);

  useEffect(() => {
    fetch("/data/healthcare_tablet_disease_price_reference_india.csv")
      .then((response) => {
        if (!response.ok) throw new Error("Dataset could not be loaded");
        return response.text();
      })
      .then((text) => {
        const [, ...rows] = parseCsv(text);
        const parsed = rows
          .filter((row) => row.length >= 10)
          .map((row) => ({
            record: row[0],
            code: row[1],
            name: row[2],
            condition: row[3],
            category: row[4],
            pack: row[5],
            price: Number(row[6]),
            basis: row[7],
            source: row[8],
            accessed: row[9],
          }))
          .filter((item) => item.name && Number.isFinite(item.price));
        setData(parsed);
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const categories = new Set(data.map((item) => item.category));
    const prices = data.map((item) => item.price).filter(Number.isFinite);
    return {
      records: data.length,
      categories: categories.size,
      lowest: prices.length ? Math.min(...prices) : 0,
    };
  }, [data]);

  function ask(nextQuery: string) {
    const clean = nextQuery.trim();
    if (!clean || !data.length) return;
    setQuery(clean);
    setActiveQuery(clean);
    setResults(retrieve(data, clean));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(query);
  }

  const summary = results.length
    ? `I found ${results.length} relevant catalogue match${results.length === 1 ? "" : "es"}. ${results[0].name} is the closest dataset match, listed at ${formatPrice(results[0].price)} for a ${results[0].pack} pack. This is a price-list match—not a recommendation to take it.`
    : "I couldn’t find a confident match in this dataset. Try a medicine name, condition, therapeutic category, PMBJP code, or price limit.";
  const needsEmergencyHelp = emergencyTerms.some((term) => normalise(activeQuery).includes(term));

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Swasthya Search home">
          <span className="brand-mark" aria-hidden="true">+</span>
          <span>Swasthya Search</span>
        </a>
        <div className="dataset-pill"><span /> PMBJP dataset · India</div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">DATASET-GROUNDED MEDICINE REFERENCE</div>
        <h1>Ask the data.<br /><em>See the evidence.</em></h1>
        <p className="hero-copy">
          Search generic medicine names, common conditions, therapeutic categories,
          pack sizes and official PMBJP prices—without losing sight of the source.
        </p>

        <form className="ask-box" onSubmit={submit}>
          <label htmlFor="health-query">Ask about a medicine, condition or price</label>
          <div className="ask-row">
            <input
              id="health-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. diabetes tablets under ₹100"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !query.trim()}>
              {loading ? "Loading…" : "Search data"}<span aria-hidden="true">→</span>
            </button>
          </div>
        </form>

        <div className="prompt-row" aria-label="Example questions">
          <span>Try</span>
          {prompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => ask(prompt)}>{prompt}</button>
          ))}
        </div>
      </section>

      <section className="metrics" aria-label="Dataset summary">
        <div><strong>{loading ? "—" : stats.records}</strong><span>medicine records</span></div>
        <div><strong>{loading ? "—" : stats.categories}</strong><span>therapeutic categories</span></div>
        <div><strong>{loading ? "—" : formatPrice(stats.lowest)}</strong><span>lowest listed pack price</span></div>
        <div><strong>100%</strong><span>answers linked to source rows</span></div>
      </section>

      {activeQuery ? (
        <section className="answer-section" aria-live="polite">
          <div className="answer-heading">
            <div>
              <span className="section-kicker">GROUNDED ANSWER</span>
              <h2>“{activeQuery}”</h2>
            </div>
            <span className="match-count">{results.length} matches</span>
          </div>

          <div className="answer-card">
            <div className="answer-icon" aria-hidden="true">✦</div>
            <div>
              <p>{summary}</p>
              {results.length > 1 && (
                <p className="answer-note">Results are ranked by medicine name, condition and therapeutic category relevance, then by listed pack price.</p>
              )}
            </div>
          </div>

          <div className={needsEmergencyHelp ? "guidance-card urgent" : "guidance-card"}>
            <div>
              <span className="section-kicker">SAFE NEXT STEP</span>
              <h3>{needsEmergencyHelp ? "Please get urgent help now" : "Confirm before using any medicine"}</h3>
            </div>
            {needsEmergencyHelp ? (
              <p>Your question may describe an emergency. Call India’s emergency number <strong>112</strong> or go to the nearest emergency department. Do not wait for a catalogue answer.</p>
            ) : (
              <p>Show these matches to a qualified clinician or pharmacist. Tell them your symptoms, diagnosis, current medicines, allergies, pregnancy status, and kidney or liver conditions so they can confirm the right medicine, strength, and dose.</p>
            )}
          </div>

          {results.length > 0 && (
            <div className="evidence-grid">
              {results.map((item, index) => (
                <article className="medicine-card" key={`${item.record}-${item.code}`}>
                  <div className="card-topline">
                    <span className="rank">0{index + 1}</span>
                    <span className="category">{item.category}</span>
                  </div>
                  <h3>{item.name}</h3>
                  <p className="condition">{item.condition}</p>
                  <dl>
                    <div><dt>Pack</dt><dd>{item.pack}</dd></div>
                    <div><dt>MRP</dt><dd>{formatPrice(item.price)}</dd></div>
                    <div><dt>PMBJP code</dt><dd>{item.code}</dd></div>
                  </dl>
                  <div className="source-row">
                    <span>Record #{item.record} · confirm before use</span>
                    <a href={item.source} target="_blank" rel="noreferrer">Official source ↗</a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="how-it-works">
          <div>
            <span className="section-kicker">HOW IT WORKS</span>
            <h2>Small dataset.<br />Clear provenance.</h2>
          </div>
          <ol>
            <li><span>01</span><div><strong>Retrieve</strong><p>Match your question against medicine names, conditions, categories and codes.</p></div></li>
            <li><span>02</span><div><strong>Rank</strong><p>Apply relevance scoring and any price ceiling you include.</p></div></li>
            <li><span>03</span><div><strong>Ground</strong><p>Build the response only from retrieved rows and expose each source.</p></div></li>
          </ol>
        </section>
      )}

      <aside className="safety-note">
        <strong>Important medical note</strong>
        <p>This tool is for price and catalogue reference only. It does not diagnose conditions or recommend treatment. Medicine suitability, dosage and availability must be confirmed with a qualified clinician or pharmacist.</p>
      </aside>

      <footer>
        <span>Swasthya Search</span>
        <p>Built from the supplied PMBJP price reference · Source access date 11 Aug 2026</p>
      </footer>
    </main>
  );
}
