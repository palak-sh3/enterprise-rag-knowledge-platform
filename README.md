# Enterprise RAG Knowledge Platform

A local development project with FastAPI, React, JWT authentication, role-based document access, PDF/DOCX ingestion, Qdrant vector search, BM25 keyword retrieval, reciprocal-rank fusion, optional Cohere reranking, Groq grounded answers with source excerpts, and persistent feedback dashboard.

## Important
- This is a reconstructed, clean project package based on the code and project details available in the conversation. Your original `.env`, Qdrant account, indexed documents, SQLite user accounts, and evaluation results are private/local and are not included.
- The included evaluation dataset is a small editable starter, not the earlier 55-question dataset or completed RAGAS report.
- Scanned PDFs need OCR before ingestion.
- LangSmith environment variables are included in `.env.example`, but explicit LangSmith trace instrumentation is not implemented in this starter package.
- Document permissions are filtered before local BM25 ranking. Qdrant results are then restricted to the allowed document IDs. For production, enforce tenant/ACL filters server-side in Qdrant as well.

## 1. Requirements
- Python 3.10 or newer
- Node.js 20.19+ or 22.12+ recommended for Vite 8
- Qdrant Cloud URL and API key
- Groq API key
- Cohere API key (optional; without it, the system uses hybrid ranking without Cohere reranking)

## 2. Backend setup (Windows PowerShell)
```powershell
cd enterprise-rag-platform
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```
Edit `.env` and set your own Qdrant, Groq, Cohere and JWT values. Do not share `.env` or commit it. Set `ADMIN_USERNAME` and a strong `ADMIN_PASSWORD` before first startup. The admin account is created when the API imports; if an account already exists, changing `.env` does not reset its password.

Generate a JWT secret if needed:
```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start backend:
```powershell
python -m uvicorn api:app --reload --host 127.0.0.1 --port 8001
```
Open http://127.0.0.1:8001/docs . Login through `/auth/token` or the React page. The first configured admin account uses the credentials from `.env`. New registrations are normal `user` accounts.

## 3. Frontend setup
Open a second terminal:
```powershell
cd enterprise-rag-platform\frontend
npm install
npm run dev
```
Open http://localhost:5173 . The React app is configured to call `http://127.0.0.1:8001`.

## 4. Upload documents
Log in as admin, open Document Upload, and upload PDF or DOCX. Default permissions in the frontend/API upload request are `admin,user`; you can change the API `allowed_roles` form field to `admin` or `admin,user`. The API chunks text, embeds it using `all-MiniLM-L6-v2`, stores vectors and payloads in Qdrant, and writes the text chunks to `data/processed/chunks.jsonl` for permission-aware BM25 retrieval.

## 5. API endpoints
- `POST /auth/register`
- `POST /auth/token`
- `GET /auth/me`
- `POST /admin/upload` (admin only)
- `POST /ask` (authenticated)
- `POST /feedback` (authenticated)
- `GET /admin/feedback` (admin only)
- `GET /health`

## 6. Evaluation starter
```powershell
python create_evaluation_dataset.py
python run_evaluation.py
```
Edit `data/evaluation/evaluation_dataset.csv` first. Ground-truth answers must be checked against your actual source documents. The starter runner saves generated answers and contexts; it does not calculate RAGAS metrics.

## 7. Troubleshooting
- `JWT_SECRET_KEY` error: copy `.env.example` to `.env` and set a long random secret.
- Qdrant error: verify `QDRANT_URL`, `QDRANT_API_KEY`, and outbound internet access.
- Groq error: verify `GROQ_API_KEY` and that `GROQ_MODEL` is available to your account.
- Cohere error: the code falls back to the original hybrid results; verify `COHERE_API_KEY` if you want reranking.
- CORS: use the exact frontend URL `http://localhost:5173`.
- Do not paste passwords, API keys, JWT tokens, or `.env` contents into chat.
