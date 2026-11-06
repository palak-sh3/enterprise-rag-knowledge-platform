import json, re
from functools import lru_cache
from rank_bm25 import BM25Okapi
from qdrant_client import QdrantClient, models
from sentence_transformers import SentenceTransformer
from config import CHUNKS_FILE, QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION, EMBEDDING_MODEL
from document_permissions import can_access_document

@lru_cache(maxsize=1)
def embedder():
    return SentenceTransformer(EMBEDDING_MODEL)

@lru_cache(maxsize=1)
def qdrant():
    if not QDRANT_URL or not QDRANT_API_KEY:
        raise RuntimeError("Set QDRANT_URL and QDRANT_API_KEY in .env.")
    return QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def load_chunks():
    if not CHUNKS_FILE.exists(): return []
    result=[]
    with CHUNKS_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            try: result.append(json.loads(line))
            except json.JSONDecodeError: continue
    return result

def tokenize(text): return re.findall(r"[a-z0-9]+", text.lower())

def hybrid_search(question, user_role="user", limit=12):
    all_chunks = [d for d in load_chunks() if can_access_document(d, user_role)]
    if not all_chunks: return []
    # BM25 is filtered to permitted documents before ranking.
    corpus=[tokenize(d.get("text", "")) for d in all_chunks]
    bm25=BM25Okapi(corpus) if corpus and any(corpus) else None
    bm25_scores=bm25.get_scores(tokenize(question)) if bm25 else []
    bm25_order=sorted(range(len(all_chunks)), key=lambda i: float(bm25_scores[i]), reverse=True)[:limit]
    vector_order=[]
    try:
        vector=embedder().encode(question, normalize_embeddings=True).tolist()
        hits=qdrant().query_points(collection_name=QDRANT_COLLECTION, query=vector, limit=limit*3, with_payload=True).points
        allowed_ids={d.get("document_id") for d in all_chunks}
        vector_order=[h for h in hits if (h.payload or {}).get("document_id") in allowed_ids][:limit]
    except Exception as exc:
        print("Qdrant retrieval warning:", exc)
    # Reciprocal-rank fusion; use local chunks as the authoritative ACL-filtered content.
    by_id={d.get("chunk_id"): d for d in all_chunks}
    score_map={}
    for rank, idx in enumerate(bm25_order, 1):
        key=all_chunks[idx].get("chunk_id", str(idx)); score_map[key]=score_map.get(key,0)+1/(60+rank)
    for rank, hit in enumerate(vector_order, 1):
        key=(hit.payload or {}).get("chunk_id")
        if key: score_map[key]=score_map.get(key,0)+1/(60+rank)
    candidates=[]
    for d in all_chunks:
        key=d.get("chunk_id")
        if key in score_map:
            item=dict(d); item["rrf_score"]=score_map[key]; candidates.append(item)
    candidates.sort(key=lambda x:x["rrf_score"], reverse=True)
    return candidates[:limit]
