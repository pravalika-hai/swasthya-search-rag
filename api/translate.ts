type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

function cleanQuery(value: string) {
  return value.replace(/```(?:json)?|```/gi, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function parseQuery(content: string) {
  try {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(content.slice(start, end + 1)) as { query?: unknown };
      if (typeof parsed.query === "string") return cleanQuery(parsed.query);
    }
  } catch {
    // Fall through to plain-text extraction.
  }
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  const plain = cleanQuery(withoutThinking.replace(/^query\s*:\s*/i, ""));
  return /[a-z]/i.test(plain) ? plain : "";
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (request.body ?? {}) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!question) {
    response.status(400).json({ error: "Invalid request" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "Translation is not configured" });
    return;
  }

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
        model: "google/gemma-3-27b-it:free",
        temperature: 0,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content: "Translate the Telugu health question into a concise English sentence for medical-document search. Use standard clinical English terms such as postpartum haemorrhage, antenatal care, anaemia, and malnutrition when they match the Telugu meaning. Preserve first-person symptom wording and uncertainty. Do not answer, diagnose, or add details. Return JSON only: {\"query\":\"English search sentence\"}.",
          },
          { role: "user", content: question },
        ],
      }),
      signal: AbortSignal.timeout(18_000),
    });

    if (!openRouterResponse.ok) {
      response.status(502).json({ error: "Translation unavailable" });
      return;
    }

    const completion = await openRouterResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = completion.choices?.[0]?.message?.content ?? "";
    const query = parseQuery(content);
    if (!query) {
      response.status(502).json({ error: "Translation unavailable" });
      return;
    }
    response.status(200).json({ query });
  } catch {
    response.status(502).json({ error: "Translation unavailable" });
  }
}
