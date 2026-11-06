import sqlite3
from datetime import datetime, timezone
from config import DATA_DIR
DB_PATH = DATA_DIR / "feedback.db"

def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_feedback_db():
    with connect() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
            question TEXT NOT NULL, answer TEXT NOT NULL, rating TEXT NOT NULL,
            created_at TEXT NOT NULL)""")
init_feedback_db()

def save_feedback(username, question, answer, rating):
    if rating not in ("positive", "negative"):
        raise ValueError("Rating must be positive or negative.")
    with connect() as con:
        con.execute("INSERT INTO feedback(username,question,answer,rating,created_at) VALUES(?,?,?,?,?)",
            (username, question, answer, rating, datetime.now(timezone.utc).isoformat()))
    return {"status": "success", "message": "Feedback saved successfully."}

def get_all_feedback():
    with connect() as con:
        rows = [dict(r) for r in con.execute("SELECT * FROM feedback ORDER BY id DESC").fetchall()]
    positive = sum(r["rating"] == "positive" for r in rows)
    return {"total": len(rows), "positive": positive, "negative": len(rows)-positive, "feedback": rows}
