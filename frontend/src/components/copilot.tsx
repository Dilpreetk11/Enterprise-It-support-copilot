"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, CircleHelp, Database, ExternalLink, FileText, Globe2, KeyRound, Laptop, LoaderCircle, Menu, MessageSquare, Plus, RefreshCw, ShieldCheck, Sparkles, Upload, Workflow, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import remarkGfm from "remark-gfm";
import { API_BASE, api, safeUrl, timedChat, type AuditEntry, type ChatResponse, type Health } from "@/lib/api";

type Message = { id: string; role: "user" | "assistant"; content: string; result?: ChatResponse; duration?: number };
type Panel = "knowledge" | "audit" | null;
const sourceNames: Record<string, string> = { private_kb: "Private knowledge", web_search: "External web", direct: "Direct response", insufficient_evidence: "Insufficient evidence" };
const suggestions = [
  { icon: ShieldCheck, title: "Connect to the VPN", text: "Get securely connected from home", question: "How do I connect to the company NovaSecure VPN on Windows and macOS?", color: "purple" },
  { icon: KeyRound, title: "Reset my password", text: "Account access, without the guesswork", question: "What are the company password policy requirements and self-service reset steps?", color: "amber" },
  { icon: Laptop, title: "Request new hardware", text: "Find the right process for your team", question: "What is the procedure to request a new laptop or hardware peripheral?", color: "blue" },
  { icon: Globe2, title: "Troubleshoot Microsoft Teams", text: "Find guidance for your next step", question: "How can I troubleshoot Microsoft Teams connection problems?", color: "green" },
];

function Answer({ message }: { message: Message }) {
  const result = message.result;
  return <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`message ${message.role}`}>
    <div className="message-avatar">{message.role === "assistant" ? <Sparkles size={17} /> : "Y"}</div>
    <div className="message-content">
      <div className="message-heading">{message.role === "assistant" ? "IT Support Copilot" : "You"}{result && <span className={`source ${result.source_used}`}>{sourceNames[result.source_used] ?? result.source_used}</span>}</div>
      {result?.source_used === "web_search" && <p className="external-note"><Globe2 size={14} /> External guidance — validate with IT before changing company systems.</p>}
      <div className="prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => { const url = safeUrl(href); return url ? <a href={url} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>; } }}>{message.content}</ReactMarkdown></div>
      {result && result.citations.length > 0 && <div className="citations">{result.citations.map((citation, index) => { const url = safeUrl(citation.url); const content = <><FileText size={13} /><span>{citation.title || "Source document"}</span>{url && <ExternalLink size={12} />}</>; return url ? <a key={index} href={url} target="_blank" rel="noopener noreferrer">{content}</a> : <span key={index}>{content}</span>; })}</div>}
      {result && <details className="trace" onToggle={(event) => { if (event.currentTarget.open) event.currentTarget.querySelector("ol")?.scrollIntoView({ block: "nearest", behavior: "auto" }); }}><summary><Workflow size={14} /> View decision path <span>{result.trace.length} steps · {((message.duration ?? 0) / 1000).toFixed(1)}s{result.retry_count > 0 ? ` · ${result.retry_count} rewrites` : ""}</span><ChevronDown size={13} /></summary><ol>{result.trace.map((step, i) => <li key={i}>{step}</li>)}</ol></details>}
    </div>
  </motion.article>;
}

function AdminPanel({ panel, close }: { panel: Exclude<Panel, null>; close: () => void }) {
  const [key, setKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  async function run(kind: "upload" | "samples" | "audit") {
    setError(""); setNotice("");
    if (!key.trim()) { setError("Enter your backend admin key."); return; }
    if (kind === "upload" && (!file || !/\.(pdf|txt|md|docx)$/i.test(file.name) || file.size === 0 || file.size > 20 * 1024 * 1024)) { setError("Choose a non-empty PDF, TXT, MD, or DOCX file up to 20 MB."); return; }
    setBusy(true);
    try {
      if (kind === "audit") setEntries((await api.audit(key)).entries);
      else { const result = kind === "samples" ? await api.samples(key) : await api.ingest(file!, key); setNotice(`${result.file ?? `${result.files} sample documents`}: ${result.chunks} chunks, ${result.vectors_created} vectors indexed.`); }
    } catch (err) { setError(err instanceof Error ? err.message : "Operation failed."); }
    finally { setBusy(false); setKey(""); }
  }
  return <dialog ref={dialogRef} className="admin-dialog" aria-labelledby="panel-title" onCancel={(event) => { if (busy) event.preventDefault(); else close(); }}>
    <div className="dialog-header"><div><span className="eyebrow">ADMIN WORKSPACE</span><h2 id="panel-title">{panel === "knowledge" ? "Company knowledge" : "Recent audit log"}</h2></div><button className="icon-button" aria-label="Close panel" onClick={close} disabled={busy}><X size={20} /></button></div>
    <p className="muted">{panel === "knowledge" ? "Add trusted IT documentation to the existing Pinecone knowledge base." : "The five latest backend queries, including requests from other interfaces."}</p>
    <label className="field-label" htmlFor="admin-key">Admin key</label><input id="admin-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="off" placeholder="Enter your backend admin key" disabled={busy} />
    <p className="field-note">Used for this operation only. Never saved to browser storage.</p>
    {panel === "knowledge" ? <><label className="upload-zone"><Upload size={25} /><strong>{file?.name ?? "Choose a company document"}</strong><span>PDF, DOCX, TXT or Markdown · up to 20 MB</span><input aria-label="Company document" type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setNotice(""); }} /></label><button className="primary-button" disabled={busy || !file} onClick={() => void run("upload")}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}Index document</button><div className="sample-box"><BookOpen size={18} /><div><strong>Sample IT documents</strong><p>Index the bundled handbook and service desk runbook. Repeating this operation can add duplicate vectors.</p></div></div><button className="secondary-button" disabled={busy} onClick={() => void run("samples")}>Index sample IT documents</button></> : <><button className="primary-button" disabled={busy} onClick={() => void run("audit")}>{busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Load recent queries</button>{entries && <div className="audit-entries">{entries.length === 0 ? <p>No queries recorded yet.</p> : entries.map((entry, i) => <article key={i}><time>{new Date(entry.created_at).toLocaleString()}</time><strong>{entry.question}</strong><span>{sourceNames[entry.source_used] ?? entry.source_used} · {entry.duration_ms ?? 0}ms</span></article>)}</div>}</>}
    {busy && <p role="status" className="muted">{panel === "knowledge" ? "Processing in Python. Indexing can take several minutes." : "Loading audit entries…"}</p>}
    {notice && <p role="status" className="success-box"><Check size={16} />{notice}</p>}{error && <p role="alert" className="error-box">{error}{error.includes("404") && " Start app.frontend_api:app for admin controls."}</p>}
  </dialog>;
}

export default function Copilot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [failedQuestion, setFailedQuestion] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [connection, setConnection] = useState<"checking" | "connected" | "offline">("checking");
  const [panel, setPanel] = useState<Panel>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  async function checkHealth() {
    setConnection("checking");
    try { const result = await api.health(); setHealth(result); setConnection(result.status === "ok" ? "connected" : "offline"); }
    catch { setConnection("offline"); setHealth(null); }
  }
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try { const result = await api.health(); if (active) { setHealth(result); setConnection(result.status === "ok" ? "connected" : "offline"); } }
      catch { if (active) { setHealth(null); setConnection("offline"); } }
      finally { inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15_000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "end" }); }, [messages, pending]);
  const answers = messages.filter((message) => message.result);
  const average = answers.length ? Math.round(answers.reduce((sum, message) => sum + (message.duration ?? 0), 0) / answers.length) : 0;
  async function send(text: string, retry = false) {
    const q = text.trim();
    if (submitting.current || q.length < 2 || q.length > 3000) return;
    submitting.current = true; setPending(true); setError(""); setFailedQuestion(""); setQuestion("");
    if (!retry) setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: q }]);
    try { const { result, duration } = await timedChat(q); setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.answer, result, duration }]); }
    catch (err) { setError(err instanceof Error ? err.message : "Request failed."); setFailedQuestion(q); }
    finally { setPending(false); submitting.current = false; }
  }
  function openPanel(next: Panel) { setPanel(next); setMobileOpen(false); }
  return <MotionConfig reducedMotion="user"><div className="workspace">
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
      <Link className="brand" href="/" aria-label="IT Support Copilot home"><span className="brand-symbol"><ShieldCheck size={23} /></span><span>NovaRetail<span className="brand-sub">IT SUPPORT COPILOT</span></span></Link>
      <button className="new-chat" disabled={pending} onClick={() => { setMessages([]); setError(""); setQuestion(""); setFailedQuestion(""); setMobileOpen(false); }}><Plus size={17} />New conversation<span>↗</span></button>
      <div className="nav-label">WORKSPACE</div><nav aria-label="Workspace"><button className="nav-item active" onClick={() => { setMobileOpen(false); document.getElementById("question")?.focus(); }}><MessageSquare size={18} />IT support chat<span className="nav-dot" /></button><button className="nav-item" onClick={() => openPanel("knowledge")}><BookOpen size={18} />Knowledge base</button><button className="nav-item" onClick={() => openPanel("audit")}><Workflow size={18} />Recent audit log</button></nav>
      <div className="sidebar-section"><div className="section-heading">SERVICE CONFIGURATION<button className="icon-button" aria-label="Refresh service status" onClick={() => void checkHealth()} disabled={connection === "checking"}><RefreshCw size={13} className={connection === "checking" ? "spin" : ""} /></button></div><div className="service"><span className={`status-dot ${health?.groq_configured ? "ok" : ""}`} /><span>Groq LLM</span><small>{health?.groq_configured ? "Configured" : health ? "Missing key" : "Unknown"}</small></div><div className="service"><span className={`status-dot ${health?.pinecone_configured ? "ok" : ""}`} /><span>Pinecone</span><small>{health?.pinecone_configured ? "Configured" : health ? "Missing key" : "Unknown"}</small></div><div className="service"><span className={`status-dot ${health?.tavily_configured ? "ok" : ""}`} /><span>Tavily search</span><small>{health?.tavily_configured ? "Configured" : health ? "Missing key" : "Unknown"}</small></div><p className="service-note">Configuration status; provider connectivity is checked when a request runs.</p></div>
      <div className="sidebar-section"><div className="section-heading">THIS CONVERSATION</div><div className="metrics"><div><strong>{answers.length}</strong><span>Queries</span></div><div><strong>{average ? `${(average / 1000).toFixed(1)}s` : "—"}</strong><span>Avg. response</span></div><div><strong>{answers.filter((message) => message.result?.source_used === "private_kb").length}</strong><span>Private KB</span></div><div><strong>{answers.filter((message) => message.result?.source_used === "web_search").length}</strong><span>Web search</span></div></div></div>
      <div className="sidebar-bottom"><div className="trust-card"><ShieldCheck size={19} /><strong>Company knowledge first</strong><p>Private retrieval, verified evidence, transparent decisions.</p></div><div className="workspace-name"><span>N</span><div>NovaRetail workspace<small>Enterprise IT support</small></div></div></div>
    </aside>
    <main className="main"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><span>Workspace</span><span className="slash">/</span><strong>IT support chat</strong></div><button className={`connection ${connection}`} onClick={() => void checkHealth()} disabled={connection === "checking"}><span className="status-dot" />{connection === "connected" ? "API connected" : connection === "checking" ? "Connecting…" : "API offline · Retry"}</button></header>
      <div className="conversation">
        <div className="conversation-title"><div><span className="eyebrow">YOUR IT WORKSPACE</span><h1>IT Support Copilot</h1><p>Answers grounded in your company’s knowledge.</p></div><span className="private-label"><ShieldCheck size={14} />Private KB first</span></div>
        {connection === "offline" && <div className="connection-banner" role="status"><div><strong>Waiting for the support API</strong><p>{/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_BASE) ? "Start the Python backend in another terminal. We’ll reconnect automatically." : "Check your connection or contact your IT administrator. We’ll retry automatically."}</p>{/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_BASE) && <><code>python -m uvicorn app.frontend_api:app --host 127.0.0.1 --port 8080</code><small>API endpoint: {API_BASE}/api/health</small></>}</div><button onClick={() => void checkHealth()}>Reconnect <RefreshCw size={13} /></button></div>}
        {health && (!health.groq_configured || !health.pinecone_configured || !health.tavily_configured) && <p className="connection-banner">Some backend provider keys are missing. Retrieval or web fallback may be unavailable.</p>}
        {messages.length === 0 ? <motion.section className="welcome" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
          <div className="welcome-symbol"><Sparkles size={30} /><span /></div><div className="welcome-kicker">LESS SEARCHING. MORE SOLVING.</div><h2>How can I help you today?</h2><p>From a forgotten password to a stubborn VPN.<br />Let’s find a reliable answer and get you back to work.</p>
          <div className="suggestions">{suggestions.map(({ icon: Icon, title, text, question: prompt, color }) => <button key={title} onClick={() => void send(prompt)} disabled={pending}><span className={`suggestion-icon ${color}`}><Icon size={20} /></span><strong>{title}</strong><span>{text}</span><ArrowRight size={16} className="suggestion-arrow" /></button>)}</div>
          <div className="retrieval-note"><div><Database size={15} /><span>Private knowledge</span></div><ArrowRight size={12} /><div><ShieldCheck size={15} /><span>Evidence check</span></div><ArrowRight size={12} /><div><Globe2 size={15} /><span>Web fallback if needed</span></div></div>
        </motion.section> : <section className="messages" aria-label="Conversation" aria-live="polite" aria-busy={pending}>{messages.map((message) => <Answer key={message.id} message={message} />)}{pending && <div className="thinking" role="status"><span className="message-avatar"><Sparkles size={17} /></span><LoaderCircle size={17} className="spin" /><span>Working through your question<span className="thinking-sub">Retrieving and evaluating evidence. The complete answer will appear when ready.</span></span></div>}<div ref={bottom} /></section>}
        {error && <div className="error-box chat-error" role="alert"><span>{error}</span><button disabled={pending} onClick={() => void send(failedQuestion, true)}>Retry question <RefreshCw size={14} /></button></div>}
      </div>
      <div className="composer-wrap">
        {messages.length > 0 && <nav className="followup-prompts" aria-label="Suggested questions">{suggestions.map(({ icon: Icon, title, question: prompt }) => <button key={title} type="button" disabled={pending} onClick={() => void send(prompt)}><Icon size={14} /><span>{title}</span></button>)}</nav>}
        <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(question); }}><label className="sr-only" htmlFor="question">Ask an IT support question</label><textarea id="question" rows={2} placeholder="Ask about VPN, passwords, devices, or anything IT…" value={question} maxLength={3000} disabled={pending} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(question); } }} /><div className="composer-bottom"><button type="button" className="attach-button" onClick={() => openPanel("knowledge")}><Plus size={16} /><span>Add knowledge</span></button><span className="input-hint">{question.length > 2700 ? `${question.length}/3000` : "Enter to send · Shift + Enter for a new line"}</span><button className="send-button" type="submit" aria-label="Send question" disabled={pending || question.trim().length < 2}>{pending ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={19} />}</button></div></form><p className="composer-footnote"><CircleHelp size={12} />Review sources before making changes. Each question is processed independently.</p></div>
    </main><AnimatePresence>{panel && <AdminPanel key={panel} panel={panel} close={() => setPanel(null)} />}</AnimatePresence>
  </div></MotionConfig>;
}
