import sqlite3
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pwdlib import PasswordHash
import jwt
from config import DATA_DIR, JWT_SECRET_KEY, ADMIN_USERNAME, ADMIN_PASSWORD

DB_PATH = DATA_DIR / "users.db"
router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
password_hash = PasswordHash.recommended()
ALGORITHM = "HS256"

if not JWT_SECRET_KEY or JWT_SECRET_KEY == "REPLACE_WITH_A_LONG_RANDOM_SECRET":
    raise RuntimeError("Set a strong JWT_SECRET_KEY in your .env file before starting the API.")

def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def init_auth_db():
    with db() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL
        )""")
        if ADMIN_PASSWORD:
            exists = con.execute("SELECT id FROM users WHERE username=?", (ADMIN_USERNAME,)).fetchone()
            if not exists:
                con.execute("INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)",
                    (ADMIN_USERNAME, password_hash.hash(ADMIN_PASSWORD), "admin", datetime.now(timezone.utc).isoformat()))

def get_user(username):
    with db() as con:
        row = con.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return dict(row) if row else None

init_auth_db()

@router.post("/register")
def register(payload: dict):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if len(username) < 3 or len(password) < 8:
        raise HTTPException(400, "Username must be at least 3 characters and password at least 8 characters.")
    try:
        with db() as con:
            con.execute("INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)",
                (username, password_hash.hash(password), "user", datetime.now(timezone.utc).isoformat()))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "Username already exists.")
    return {"status": "success", "message": "Account created. Please log in."}

@router.post("/token")
def login(form: OAuth2PasswordRequestForm = Depends()):
    user = get_user(form.username)
    if not user or not password_hash.verify(form.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password", headers={"WWW-Authenticate": "Bearer"})
    exp = datetime.now(timezone.utc) + timedelta(hours=12)
    token = jwt.encode({"sub": user["username"], "exp": exp}, JWT_SECRET_KEY, algorithm=ALGORITHM)
    return {"access_token": token, "token_type": "bearer", "username": user["username"], "role": user["role"]}

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise ValueError("Missing subject")
    except Exception:
        raise HTTPException(401, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    user = get_user(username)
    if not user:
        raise HTTPException(401, "User no longer exists")
    return {"id": user["id"], "username": user["username"], "role": user["role"]}

def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "Administrator access required")
    return user

@router.get("/me")
def me(user=Depends(get_current_user)):
    return user
