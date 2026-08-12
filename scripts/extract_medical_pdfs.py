import hashlib
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


OUTPUT = Path(sys.argv[1])
SOURCES = [Path(value) for value in sys.argv[2:]]
MAX_CHUNK = 1500
OVERLAP = 220

MEDICINE_TERMS = re.compile(
    r"\b(?:medicine|medicines|medication|medications|drug|drugs|tablet|tablets|"
    r"supplement|supplements|antibiotic|antibiotics|antiviral|antiretroviral|"
    r"prophylaxis|treatment|dose|doses|dosing|folic acid|iron|calcium|aspirin|"
    r"oxytocin|misoprostol|carbetocin|ergometrine|sulfadoxine|pyrimethamine|"
    r"azt|nvp|tenofovir|rutf|f-75|f-100|ors|resomal)\b",
    re.IGNORECASE,
)
RECOMMENDATION_TERMS = re.compile(
    r"\b(?:recommendation|recommended|not recommended|should|should not|good practice|"
    r"counselling|monitoring|screening|assessment|prevention|management)\b",
    re.IGNORECASE,
)


def tidy(value: str) -> str:
    value = value.replace("\x00", " ").replace("\u00ad", "")
    value = re.sub(r"([A-Za-z])-\s+([a-z])", r"\1\2", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def sentence_snippets(text: str, pattern: re.Pattern[str], limit: int = 900) -> str:
    sentences = re.split(r"(?<=[.!?])\s+|(?=\b(?:Recommended|Not recommended|Remarks)\b)", text)
    selected = []
    size = 0
    for sentence in sentences:
        sentence = tidy(sentence)
        if not sentence or not pattern.search(sentence):
            continue
        if size + len(sentence) + 1 > limit:
            break
        selected.append(sentence)
        size += len(sentence) + 1
    return " ".join(selected)


def chunks(text: str):
    if len(text) <= MAX_CHUNK:
        yield text
        return
    start = 0
    while start < len(text):
        end = min(start + MAX_CHUNK, len(text))
        if end < len(text):
            boundary = max(text.rfind(". ", start + 700, end), text.rfind("; ", start + 700, end))
            if boundary > start:
                end = boundary + 1
        yield text[start:end].strip()
        if end >= len(text):
            break
        start = max(end - OVERLAP, start + 1)


def document_title(reader: PdfReader, source: Path) -> str:
    metadata_title = tidy(str((reader.metadata or {}).get("/Title") or ""))
    if metadata_title:
        return metadata_title
    for page in reader.pages[:10]:
        candidate = tidy(page.extract_text() or "")
        if 20 <= len(candidate) <= 260:
            return candidate
    return source.stem


records = []
source_metadata = []
for source in SOURCES:
    reader = PdfReader(str(source))
    title = document_title(reader, source)
    sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
    source_metadata.append(
        {"file": source.name, "title": title, "pageCount": len(reader.pages), "sha256": sha256}
    )

    for page_number, page in enumerate(reader.pages, start=1):
        page_text = tidy(page.extract_text() or "")
        page_text = tidy(re.sub(re.escape(title), " ", page_text, flags=re.IGNORECASE))
        if len(page_text) < 40:
            continue
        for part, chunk in enumerate(chunks(page_text), start=1):
            record_title = f"{source.name} - page {page_number}"
            if part > 1:
                record_title += f", part {part}"
            medicine = sentence_snippets(chunk, MEDICINE_TERMS)
            recommendations = sentence_snippets(chunk, RECOMMENDATION_TERMS)
            records.append(
                {
                    "id": len(records) + 1,
                    "source": source.name,
                    "title": record_title,
                    "page": page_number,
                    "overview": chunk,
                    "medicine": medicine,
                    "suggestions": recommendations,
                    "referenceLike": chunk.lower().count("http") >= 3
                    or chunk.lower().count(" et al") >= 3
                    or chunk.lower().startswith("references "),
                }
            )

payload = {
    "sources": source_metadata,
    "pageCount": sum(source["pageCount"] for source in source_metadata),
    "recordCount": len(records),
    "records": records,
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps({"pages": payload["pageCount"], "records": len(records), "sources": source_metadata}))
