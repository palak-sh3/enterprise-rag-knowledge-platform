from groq import Groq
import cohere
from config import GROQ_API_KEY, GROQ_MODEL, COHERE_API_KEY, COHERE_RERANK_MODEL
from retrieval import hybrid_search

SYSTEM_PROMPT = """You are an enterprise knowledge assistant. Answer ONLY using the supplied document excerpts. Cite every factual claim with [Source N]. If the excerpts do not contain enough evidence, say exactly: I don't know based on the available documents. Do not invent facts, policies, figures, or citations."""

def rerank_results(question, documents, top_n=5):
    if not documents or not COHERE_API_KEY: return documents[:top_n]
    try:
        client=cohere.ClientV2(api_key=COHERE_API_KEY)
        response=client.rerank(model=COHERE_RERANK_MODEL, query=question, documents=[d.get("text","") for d in documents], top_n=min(top_n,len(documents)))
        return [documents[item.index] for item in response.results]
    except Exception as exc:
        print("Cohere reranking fallback:", exc)
        return documents[:top_n]

def generate_answer_with_sources(question, user_role="user"):
    candidates=hybrid_search(question,user_role=user_role,limit=15)
    if not candidates:
        return "I don't know based on the available documents.", []
    selected=rerank_results(question,candidates,top_n=5)
    sources=[]; context=[]
    for i,item in enumerate(selected,1):
        source=item.get("source") or (item.get("metadata") or {}).get("file_name") or "Unknown document"
        sources.append({"source_number":i,"source":source,"text":item.get("text","")})
        context.append(f"[Source {i}] {source}\n{item.get('text','')}")
    if not GROQ_API_KEY:
        return "Document retrieval succeeded, but GROQ_API_KEY is not configured. Add it to .env to enable answer generation.",sources
    client=Groq(api_key=GROQ_API_KEY)
    completion=client.chat.completions.create(model=GROQ_MODEL,temperature=0.1,max_tokens=1200,messages=[
        {"role":"system","content":SYSTEM_PROMPT},
        {"role":"user","content":f"Question: {question}\n\nDocument excerpts:\n"+"\n\n".join(context)}
    ])
    answer=completion.choices[0].message.content or "I don't know based on the available documents."
    return answer,sources

def generate_answer_with_context(question):
    answer,sources=generate_answer_with_sources(question,"admin")
    return answer,[s["text"] for s in sources]

def generate_answer(question):
    return generate_answer_with_sources(question,"admin")[0]
