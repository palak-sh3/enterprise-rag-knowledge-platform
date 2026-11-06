import hashlib, json, uuid
from pathlib import Path
from pypdf import PdfReader
from docx import Document as DocxDocument
from qdrant_client import models
from config import CHUNKS_FILE, UPLOAD_DIR, QDRANT_COLLECTION
from retrieval import embedder, qdrant
from document_permissions import validate_allowed_roles

CHUNK_SIZE = 1800
CHUNK_OVERLAP = 250

def extract_text(path: Path) -> str:
    suffix=path.suffix.lower()
    if suffix == ".pdf":
        return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    if suffix == ".docx":
        doc=DocxDocument(str(path))
        parts=[p.text for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows: parts.append(" | ".join(cell.text for cell in row.cells))
        return "\n".join(parts)
    raise ValueError("Only PDF and DOCX files are supported.")

def split_text(text):
    text=" ".join(text.split())
    if not text: return []
    chunks=[]; start=0
    while start < len(text):
        end=min(start+CHUNK_SIZE, len(text))
        if end < len(text):
            boundary=text.rfind(" ", start+CHUNK_SIZE//2, end)
            if boundary > start: end=boundary
        chunk=text[start:end].strip()
        if chunk: chunks.append(chunk)
        if end >= len(text): break
        start=max(end-CHUNK_OVERLAP, start+1)
    return chunks

def ingest_and_index(file_path, original_name, allowed_roles=None):
    roles=validate_allowed_roles(allowed_roles or ["admin", "user"])
    path=Path(file_path)
    text=extract_text(path)
    if len(text.strip()) < 20:
        raise ValueError("No readable text found. Scanned PDFs need OCR before upload.")
    doc_id=hashlib.sha256(text.encode("utf-8")).hexdigest()
    existing=[]
    if CHUNKS_FILE.exists():
        with CHUNKS_FILE.open(encoding="utf-8") as f:
            existing=[json.loads(line) for line in f if line.strip()]
    if any(x.get("document_id")==doc_id for x in existing):
        return {"status":"skipped", "message":"This document has already been indexed.", "chunks":0, "document_id":doc_id}
    texts=split_text(text)
    model=embedder(); client=qdrant()
    if not client.collection_exists(QDRANT_COLLECTION):
        client.create_collection(collection_name=QDRANT_COLLECTION, vectors_config=models.VectorParams(size=model.get_sentence_embedding_dimension(), distance=models.Distance.COSINE))
    vectors=model.encode(texts, normalize_embeddings=True, show_progress_bar=False).tolist()
    records=[]
    for i,(chunk,vector) in enumerate(zip(texts,vectors)):
        chunk_id=hashlib.sha256(f"{doc_id}:{i}".encode()).hexdigest()
        payload={"chunk_id":chunk_id,"document_id":doc_id,"text":chunk,"source":original_name,"source_type":"file","allowed_roles":roles,"metadata":{"file_name":original_name,"allowed_roles":roles,"chunk_index":i}}
        records.append((chunk_id,payload,vector))
    points=[models.PointStruct(id=str(uuid.uuid5(uuid.NAMESPACE_URL, cid)), vector=vec, payload=payload) for cid,payload,vec in records]
    client.upsert(collection_name=QDRANT_COLLECTION, points=points, wait=True)
    with CHUNKS_FILE.open("a",encoding="utf-8") as f:
        for _,payload,_ in records: f.write(json.dumps(payload,ensure_ascii=False)+"\n")
    return {"status":"success","message":"Document indexed successfully.","chunks":len(texts),"document_id":doc_id}
