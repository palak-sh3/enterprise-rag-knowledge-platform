import { useEffect, useState } from "react";
import {
  BookOpen,
  MessageSquare,
  Upload,
  LogOut,
  Send,
  FileText,
  Bot,
  User,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
  LoaderCircle,
  LayoutDashboard,
  RefreshCw,
  Users,
  TrendingUp,
  TrendingDown,
  CalendarDays,
} from "lucide-react";
import "./App.css";

const API = "http://127.0.0.1:8001";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("rag_token") || "");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState("chat");
  const [authMode, setAuthMode] = useState("login");

  const [authForm, setAuthForm] = useState({
    username: "",
    password: "",
  });

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Admin feedback dashboard state
  const [feedbackData, setFeedbackData] = useState({
    total: 0,
    positive: 0,
    negative: 0,
    feedback: [],
  });
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  // Common API request function
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || `Request failed (${response.status})`);
    }

    return data;
  }

  // Verify logged-in user
  useEffect(() => {
    if (!token) return;

    request("/auth/me")
      .then((data) => {
        setUsername(data.username);
        setRole(data.role);
      })
      .catch(() => {
        localStorage.removeItem("rag_token");
        setToken("");
        setUsername("");
        setRole("");
      });
  }, [token]);

  // Load all feedback for the admin dashboard
  async function loadAdminFeedback() {
    setFeedbackLoading(true);
    setFeedbackError("");

    try {
      const data = await request("/admin/feedback");

      setFeedbackData({
        total: data.total ?? 0,
        positive: data.positive ?? 0,
        negative: data.negative ?? 0,
        feedback: Array.isArray(data.feedback) ? data.feedback : [],
      });
    } catch (error) {
      setFeedbackError(error.message);
    } finally {
      setFeedbackLoading(false);
    }
  }

  // Login and registration
  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setNotice("");

    try {
      if (authMode === "register") {
        const response = await fetch(`${API}/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(authForm),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Registration failed");
        }

        setNotice("Account created. Please log in.");
        setAuthMode("login");

        setAuthForm({
          username: authForm.username,
          password: "",
        });
      } else {
        const body = new URLSearchParams();
        body.append("username", authForm.username);
        body.append("password", authForm.password);

        const response = await fetch(`${API}/auth/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || "Login failed");
        }

        localStorage.setItem("rag_token", data.access_token);
        setToken(data.access_token);
        setUsername(data.username);
        setRole(data.role);
        setMessages([]);
        setPage("chat");
        setNotice("");
        setAuthForm({ username: "", password: "" });
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  // Logout
  function logout() {
    localStorage.removeItem("rag_token");
    setToken("");
    setUsername("");
    setRole("");
    setMessages([]);
    setPage("chat");
    setNotice("");
    setFeedbackData({
      total: 0,
      positive: 0,
      negative: 0,
      feedback: [],
    });
  }

  // Ask a question
  async function askQuestion(event) {
    event.preventDefault();

    if (!question.trim() || loading) return;

    const userQuestion = question.trim();

    setQuestion("");
    setNotice("");

    setMessages((previous) => [
      ...previous,
      {
        type: "user",
        text: userQuestion,
      },
    ]);

    setLoading(true);

    try {
      const data = await request("/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userQuestion,
        }),
      });

      setMessages((previous) => [
        ...previous,
        {
          type: "assistant",
          text: data.answer,
          sources: Array.isArray(data.sources) ? data.sources : [],
          question: userQuestion,
          feedback: null,
          feedbackLoading: false,
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          type: "error",
          text: error.message,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  // Save feedback to backend
  async function sendFeedback(messageIndex, rating) {
    const message = messages[messageIndex];

    if (
      !message ||
      message.type !== "assistant" ||
      message.feedback ||
      message.feedbackLoading
    ) {
      return;
    }

    setMessages((previous) =>
      previous.map((item, index) =>
        index === messageIndex ? { ...item, feedbackLoading: true } : item,
      ),
    );

    setNotice("");

    try {
      await request("/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: message.question,
          answer: message.text,
          rating,
        }),
      });

      setMessages((previous) =>
        previous.map((item, index) =>
          index === messageIndex
            ? {
                ...item,
                feedback: rating,
                feedbackLoading: false,
              }
            : item,
        ),
      );

      setNotice("Feedback saved successfully!");
    } catch (error) {
      setMessages((previous) =>
        previous.map((item, index) =>
          index === messageIndex ? { ...item, feedbackLoading: false } : item,
        ),
      );

      setNotice(`Feedback failed: ${error.message}`);
    }
  }

  // Upload document (admin only)
  async function uploadDocument(event) {
    event.preventDefault();

    if (!file) {
      setNotice("Please select a PDF or DOCX file.");
      return;
    }

    setUploading(true);
    setNotice("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const data = await request("/admin/upload", {
        method: "POST",
        body: formData,
      });

      setNotice(
        `${String(data.status || "success").toUpperCase()}: ${
          data.message || "Document processed successfully."
        } ${data.chunks ? `(${data.chunks} chunks)` : ""}`,
      );

      setFile(null);
      event.target.reset();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setUploading(false);
    }
  }

  // Format feedback date
  function formatDate(dateValue) {
    if (!dateValue) return "—";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return date.toLocaleString();
  }

  // Login/register screen
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand-mark">
            <BookOpen size={25} />
          </div>

          <h1>Enterprise RAG</h1>
          <p className="muted">Your intelligent knowledge assistant</p>

          <div className="auth-tabs">
            <button
              className={authMode === "login" ? "active" : ""}
              onClick={() => {
                setAuthMode("login");
                setNotice("");
              }}
            >
              Login
            </button>

            <button
              className={authMode === "register" ? "active" : ""}
              onClick={() => {
                setAuthMode("register");
                setNotice("");
              }}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth}>
            <label>Username</label>

            <input
              value={authForm.username}
              onChange={(e) =>
                setAuthForm({
                  ...authForm,
                  username: e.target.value,
                })
              }
              placeholder="Enter username"
              required
            />

            <label>Password</label>

            <input
              type="password"
              value={authForm.password}
              onChange={(e) =>
                setAuthForm({
                  ...authForm,
                  password: e.target.value,
                })
              }
              placeholder="Enter password"
              required
            />

            {notice && <div className="notice">{notice}</div>}

            <button className="primary-btn full-btn" disabled={authLoading}>
              {authLoading
                ? "Please wait..."
                : authMode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          <p className="auth-foot">
            Secure access to your organization's documents
          </p>
        </div>
      </div>
    );
  }

  // Main application
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <BookOpen size={22} />
          </div>

          <div>
            <strong>Enterprise RAG</strong>
            <small>Knowledge Platform</small>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <button
          className={`nav-item ${page === "chat" ? "selected" : ""}`}
          onClick={() => {
            setPage("chat");
            setNotice("");
          }}
        >
          <MessageSquare size={18} />
          Knowledge Chat
        </button>

        {role === "admin" && (
          <>
            <div className="nav-label">ADMINISTRATION</div>

            <button
              className={`nav-item ${page === "upload" ? "selected" : ""}`}
              onClick={() => {
                setPage("upload");
                setNotice("");
              }}
            >
              <Upload size={18} />
              Document Upload
            </button>

            <button
              className={`nav-item ${page === "feedback" ? "selected" : ""}`}
              onClick={() => {
                setPage("feedback");
                setNotice("");
                loadAdminFeedback();
              }}
            >
              <LayoutDashboard size={18} />
              Feedback Dashboard
            </button>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">
              <User size={17} />
            </div>

            <div className="profile-info">
              <strong>{username}</strong>
              <small>{role || "User"}</small>
            </div>

            <ShieldCheck size={17} className="shield" />
          </div>

          <button className="logout-btn" onClick={logout}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="top-eyebrow">KNOWLEDGE WORKSPACE</span>

            <h2>
              {page === "chat"
                ? "Ask your knowledge base"
                : page === "upload"
                  ? "Document management"
                  : "Feedback Dashboard"}
            </h2>
          </div>

          <div className="top-user">
            <span className="status-dot"></span>
            {username} · {role}
          </div>
        </header>

        {/* KNOWLEDGE CHAT */}
        {page === "chat" ? (
          <section className="chat-page">
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-icon">
                  <Bot size={30} />
                </div>

                <h1>What would you like to know?</h1>

                <p>
                  Ask questions about your uploaded documents. Answers are
                  generated using retrieved document evidence.
                </p>

                <div className="suggestions">
                  <button
                    onClick={() =>
                      setQuestion(
                        "What is the main objective of the uploaded project?",
                      )
                    }
                  >
                    <FileText size={17} />
                    Summarize a project objective
                  </button>

                  <button
                    onClick={() =>
                      setQuestion(
                        "What technologies are mentioned in the documents?",
                      )
                    }
                  >
                    <BookOpen size={17} />
                    Find technologies in documents
                  </button>
                </div>
              </div>
            ) : (
              <div className="conversation">
                {messages.map((message, index) => (
                  <div className={`message-row ${message.type}`} key={index}>
                    <div className="message-avatar">
                      {message.type === "user" ? (
                        <User size={17} />
                      ) : (
                        <Bot size={18} />
                      )}
                    </div>

                    <div className="message-content">
                      <strong>
                        {message.type === "user"
                          ? "You"
                          : message.type === "error"
                            ? "Error"
                            : "RAG Assistant"}
                      </strong>

                      <p>{message.text}</p>

                      {message.type === "assistant" &&
                        Array.isArray(message.sources) &&
                        message.sources.length > 0 && (
                          <div className="sources">
                            <h4>
                              <FileText size={15} />
                              Retrieved sources
                            </h4>

                            {message.sources.map((source, sourceIndex) => (
                              <details
                                key={`${source.source_number || sourceIndex}-${source.source || "source"}`}
                                className="source-item"
                              >
                                <summary>
                                  Source{" "}
                                  {source.source_number || sourceIndex + 1}
                                  {" · "}
                                  {source.source || "Unknown document"}
                                </summary>

                                <p className="source-text">
                                  {source.text || "No text excerpt available."}
                                </p>
                              </details>
                            ))}
                          </div>
                        )}

                      {message.type === "assistant" && (
                        <div className="feedback">
                          <span>
                            {message.feedback === "positive"
                              ? "Thanks! You marked this helpful."
                              : message.feedback === "negative"
                                ? "Thanks! You marked this not helpful."
                                : message.feedbackLoading
                                  ? "Saving feedback..."
                                  : "Was this answer helpful?"}
                          </span>

                          <button
                            title="Helpful"
                            disabled={
                              !!message.feedback || message.feedbackLoading
                            }
                            className={
                              message.feedback === "positive"
                                ? "feedback-selected"
                                : ""
                            }
                            onClick={() => sendFeedback(index, "positive")}
                          >
                            {message.feedbackLoading ? (
                              <LoaderCircle size={15} className="spin" />
                            ) : (
                              <ThumbsUp size={15} />
                            )}
                          </button>

                          <button
                            title="Not helpful"
                            disabled={
                              !!message.feedback || message.feedbackLoading
                            }
                            className={
                              message.feedback === "negative"
                                ? "feedback-selected"
                                : ""
                            }
                            onClick={() => sendFeedback(index, "negative")}
                          >
                            <ThumbsDown size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="loading-line">
                    <LoaderCircle className="spin" size={18} />
                    Searching documents and preparing an answer...
                  </div>
                )}
              </div>
            )}

            {notice && <div className="notice chat-notice">{notice}</div>}

            <form className="chat-input-area" onSubmit={askQuestion}>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about your documents..."
                disabled={loading}
              />

              <button
                className="send-btn"
                disabled={loading || !question.trim()}
              >
                <Send size={18} />
              </button>
            </form>

            <p className="input-hint">
              AI-generated responses can be inaccurate. Verify important
              information against the cited sources.
            </p>
          </section>
        ) : page === "upload" ? (
          /* DOCUMENT UPLOAD */
          <section className="upload-page">
            <div className="upload-card">
              <div className="upload-icon">
                <Upload size={26} />
              </div>

              <h1>Upload a document</h1>

              <p>
                Add a PDF or Word document to the knowledge base. It will be
                extracted, chunked, embedded, and indexed for retrieval.
              </p>

              <form onSubmit={uploadDocument}>
                <label className="file-drop">
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />

                  <FileText size={28} />

                  <strong>
                    {file ? file.name : "Choose a PDF or DOCX file"}
                  </strong>

                  <span>
                    {file
                      ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                      : "Maximum file size: 20 MB"}
                  </span>
                </label>

                <button
                  className="primary-btn full-btn"
                  disabled={uploading || !file}
                >
                  {uploading ? "Uploading and indexing..." : "Upload document"}
                </button>
              </form>

              {notice && <div className="notice">{notice}</div>}
            </div>

            <div className="info-card">
              <ShieldCheck size={20} />

              <div>
                <strong>Admin-only access</strong>

                <p>
                  Only authenticated administrators can upload documents to the
                  knowledge base.
                </p>
              </div>
            </div>
          </section>
        ) : (
          /* ADMIN FEEDBACK DASHBOARD */
          <section className="dashboard-page">
            <div className="dashboard-heading">
              <div>
                <h1>Feedback overview</h1>
                <p>Review feedback submitted by knowledge platform users.</p>
              </div>

              <button
                className="refresh-btn"
                onClick={loadAdminFeedback}
                disabled={feedbackLoading}
              >
                <RefreshCw
                  size={16}
                  className={feedbackLoading ? "spin" : ""}
                />
                Refresh
              </button>
            </div>

            {feedbackError && (
              <div className="notice dashboard-error">{feedbackError}</div>
            )}

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon total-icon">
                  <Users size={21} />
                </div>

                <div>
                  <span>Total feedback</span>
                  <strong>{feedbackData.total}</strong>
                  <small>All submitted ratings</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon positive-icon">
                  <TrendingUp size={21} />
                </div>

                <div>
                  <span>Positive feedback</span>
                  <strong>{feedbackData.positive}</strong>
                  <small>Helpful answers</small>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon negative-icon">
                  <TrendingDown size={21} />
                </div>

                <div>
                  <span>Negative feedback</span>
                  <strong>{feedbackData.negative}</strong>
                  <small>Answers needing improvement</small>
                </div>
              </div>
            </div>

            <div className="feedback-table-card">
              <div className="table-heading">
                <div>
                  <h2>Recent feedback</h2>
                  <p>
                    User ratings and their associated questions and answers.
                  </p>
                </div>

                <span className="record-count">
                  {feedbackData.feedback.length} records
                </span>
              </div>

              {feedbackLoading ? (
                <div className="dashboard-state">
                  <LoaderCircle size={25} className="spin" />
                  <p>Loading feedback records...</p>
                </div>
              ) : feedbackError ? (
                <div className="dashboard-state">
                  <ShieldCheck size={25} />
                  <p>Unable to load feedback. Try refreshing.</p>
                </div>
              ) : feedbackData.feedback.length === 0 ? (
                <div className="dashboard-state">
                  <MessageSquare size={28} />
                  <h3>No feedback yet</h3>
                  <p>Feedback submitted by users will appear here.</p>
                </div>
              ) : (
                <div className="feedback-table-wrapper">
                  <table className="feedback-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Question</th>
                        <th>Answer</th>
                        <th>Rating</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>

                    <tbody>
                      {feedbackData.feedback.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="table-user">
                              <div className="table-avatar">
                                <User size={15} />
                              </div>
                              <strong>{item.username}</strong>
                            </div>
                          </td>

                          <td className="question-cell">{item.question}</td>

                          <td className="answer-cell">
                            <details className="answer-details">
                              <summary>View answer</summary>
                              <p>{item.answer}</p>
                            </details>
                          </td>

                          <td>
                            <span
                              className={`rating-pill ${
                                item.rating === "positive"
                                  ? "rating-positive"
                                  : "rating-negative"
                              }`}
                            >
                              {item.rating === "positive" ? (
                                <ThumbsUp size={13} />
                              ) : (
                                <ThumbsDown size={13} />
                              )}
                              {item.rating}
                            </span>
                          </td>

                          <td className="date-cell">
                            <span>
                              <CalendarDays size={14} />
                              {formatDate(item.created_at)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="dashboard-footer">
              <ShieldCheck size={16} />
              <span>This dashboard is available to administrators only.</span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
