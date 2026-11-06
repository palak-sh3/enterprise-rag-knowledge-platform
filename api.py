import os, tempfile
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from auth import router as auth_router, get_current_user, require_admin
from generate_answer import generate_answer_with_sources
from document_pipeline import ingest_and_index
from feedback import save_feedback, get_all_feedback
from config import MAX_UPLOAD_MB, UPLOAD_DIR

app=FastAPI(title="Enterprise RAG Knowledge Platform",version="1.0.0",description="Authenticated enterprise document ingestion and question answering API")
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:5173","http://127.0.0.1:5173"],allow_credentials=False,allow_methods=["*"],allow_headers=["*"])
app.include_router(auth_router)

class AskRequest(BaseModel): question: str=Field(...,min_length=2,max_length=2000)
class FeedbackRequest(BaseModel):
    question: str=Field(...,min_length=1,max_length=2000)
    answer: str=Field(...,min_length=1)
    rating: str

@app.get("/")
def home(): return {"service":"Enterprise RAG Knowledge Platform","docs":"/docs"}
@app.get("/health")
def health(): return {"status":"healthy","service":"Enterprise RAG API"}

@app.post("/ask")
def ask(request: AskRequest,user=Depends(get_current_user)):
    try:
        answer,sources=generate_answer_with_sources(request.question,user_role=user["role"])
        return {"answer":answer,"sources":sources,"asked_by":user["username"]}
    except Exception as exc:
        raise HTTPException(500,f"Question answering failed: {exc}")

@app.post("/admin/upload")
async def upload_document(file: UploadFile=File(...),allowed_roles: Optional[str]=Form(default="admin,user"),admin=Depends(require_admin)):
    filename=Path(file.filename or "document").name
    suffix=Path(filename).suffix.lower()
    if suffix not in {".pdf",".docx"}: raise HTTPException(400,"Only PDF and DOCX files are supported.")
    content=await file.read()
    if not content: raise HTTPException(400,"Uploaded file is empty.")
    if len(content)>MAX_UPLOAD_MB*1024*1024: raise HTTPException(413,f"File exceeds {MAX_UPLOAD_MB} MB limit.")
    roles=[x.strip().lower() for x in allowed_roles.split(",") if x.strip()]
    temp_path=None
    try:
        fd,temp_path=tempfile.mkstemp(suffix=suffix,dir=UPLOAD_DIR)
        with os.fdopen(fd,"wb") as out: out.write(content)
        result=ingest_and_index(temp_path,filename,roles)
        return result
    except ValueError as exc: raise HTTPException(400,str(exc))
    except Exception as exc: raise HTTPException(500,f"Document processing failed: {exc}")
    finally:
        if temp_path and os.path.exists(temp_path): os.remove(temp_path)

@app.post("/feedback")
def submit_feedback(request: FeedbackRequest,user=Depends(get_current_user)):
    try: return save_feedback(user["username"],request.question,request.answer,request.rating)
    except ValueError as exc: raise HTTPException(400,str(exc))

@app.get("/admin/feedback")
def admin_feedback(admin=Depends(require_admin)):
    return get_all_feedback()
