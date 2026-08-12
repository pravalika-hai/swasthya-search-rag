type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

type ContextRecord = {
  title: string;
  overview: string;
  medicine: string;
  suggestions: string;
};

type ChatBody = {
  question?: string;
  context?: ContextRecord[];
  fallbackLines?: string[];
  sourceLines?: string[];
  ambiguous?: boolean;
  responseMode?: "telugu" | "bilingual";
};

const allowedGlueWords = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "because", "by", "can",
  "condition", "document", "for", "from", "has", "in", "information", "is", "it",
  "may", "medical", "medicine", "of", "on", "or", "that", "the", "this", "to",
  "treatment", "with", "without",
]);

function cleanLine(value: string) {
  return value
    .replace(/^[-*#\d.)\s]+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

function tokens(value: string) {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function isGrounded(line: string, context: string) {
  const sourceTokens = new Set(tokens(context));
  const unsupported = tokens(line).filter((token) => token.length > 2 && !allowedGlueWords.has(token) && !sourceTokens.has(token));
  const sourceNumbers = new Set(context.match(/\b\d+(?:\.\d+)?\b/g) ?? []);
  const unsupportedNumbers = (line.match(/\b\d+(?:\.\d+)?\b/g) ?? []).filter((number) => !sourceNumbers.has(number));
  return unsupported.length === 0 && unsupportedNumbers.length === 0;
}

function parseModelLines(content: string) {
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(content.slice(start, end + 1)) as { line1?: unknown; line2?: unknown };
      if (typeof parsed.line1 === "string" && typeof parsed.line2 === "string") {
        return [cleanLine(parsed.line1), cleanLine(parsed.line2)];
      }
    }
  } catch {
    // Fall through to plain-text parsing.
  }
  const lines = content.split(/\r?\n/).map(cleanLine).filter(Boolean);
  return lines.length >= 2 ? [lines[0], lines[1]] : null;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (request.body ?? {}) as ChatBody;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  const responseMode = body.responseMode === "telugu" ? "telugu" : "bilingual";
  const fallbackLines = Array.isArray(body.fallbackLines)
    ? body.fallbackLines.slice(0, 2).map((line) => cleanLine(String(line)))
    : [];
  const sourceLines = Array.isArray(body.sourceLines)
    ? body.sourceLines.slice(0, 2).map((line) => cleanLine(String(line)))
    : [];
  const context = Array.isArray(body.context)
    ? body.context.slice(0, 4).map((record) => ({
        title: String(record.title ?? "").slice(0, 100),
        overview: String(record.overview ?? "").slice(0, 1800),
        medicine: String(record.medicine ?? "").slice(0, 900),
        suggestions: String(record.suggestions ?? "").slice(0, 900),
      }))
    : [];

  if (!question || fallbackLines.length !== 2 || sourceLines.length !== 2) {
    response.status(400).json({ error: "Invalid request" });
    return;
  }

  if (body.ambiguous || context.length === 0) {
    response.status(200).json({ lines: fallbackLines, model: "document-fallback" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "OpenRouter is not configured", lines: fallbackLines });
    return;
  }

  const contextText = JSON.stringify({ context, sourceLines });
  const languageInstruction = responseMode === "telugu"
    ? "Translate sourceAnswerLines[0] into Telugu line1 and sourceAnswerLines[1] into Telugu line2. Keep medicine names in their source form when needed."
    : "Copy sourceAnswerLines[0] exactly as line1, then write its natural Telugu translation as line2.";
  const systemPrompt = [
    "You are MedSearch. Use ONLY the supplied medical-document context.",
    "Never add outside knowledge, a diagnosis, a personal prescription, or an unlisted medicine.",
    "Never add dosage or frequency unless it appears verbatim in the context.",
    "If the context is insufficient, preserve the supplied fallback wording.",
    languageInstruction,
    "Return JSON only: {\"line1\":\"short line\",\"line2\":\"short line\"}.",
    "Each line must be under 110 characters. No headings, bullets, warnings, citations, or extra text.",
  ].join(" ");

  try {
    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://swasthya-search-rag.vercel.app/",
        "X-Title": "MedSearch",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        temperature: 0,
        max_tokens: 240,
        reasoning: { effort: "none" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: JSON.stringify({ question, sourceAnswerLines: sourceLines, medicalDocumentContext: context, requiredFallback: fallbackLines }),
          },
        ],
      }),
      signal: AbortSignal.timeout(18_000),
    });

    if (!openRouterResponse.ok) {
      response.status(200).json({ lines: fallbackLines, model: "document-fallback" });
      return;
    }

    const completion = await openRouterResponse.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = completion.choices?.[0]?.message?.content ?? "";
    const proposed = parseModelLines(content);
    const validTranslation = proposed && proposed.every((line) => line && isGrounded(line, contextText));
    const validLanguageShape = responseMode === "telugu" || proposed?.[0] === sourceLines[0];
    const lines = validTranslation && validLanguageShape ? proposed : fallbackLines;

    response.status(200).json({ lines, model: completion.model ?? "openrouter/free" });
  } catch {
    response.status(200).json({ lines: fallbackLines, model: "document-fallback" });
  }
}
