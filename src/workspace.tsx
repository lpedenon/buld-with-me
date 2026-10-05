import { Fragment, useEffect, useMemo, useRef, useState } from "react";

type AppMode = "demo" | "live" | "needs-credentials";
type Phase = "start" | "architecture" | "building";
type Option = {
  id: string;
  title: string;
  summary: string;
  tradeoff: string;
  example: string;
  steps: string[];
};
type Architecture = { framing: string; options: Option[]; recommendation: string; question: string; mode: AppMode };
type ChatMessage = { role: "user" | "assistant"; content: string };
type ProposedFile = { path: string; reason: string; content: string };
type Verification = { label: string; command: string };
type ContinueResult = { response: string; files: ProposedFile[]; verification: Verification[]; mode: AppMode };
type ProjectFile = { path: string; size: number };
type ContextFile = { path: string; content: string };
type SavedDecision = {
  id: string;
  date: string;
  projectName: string;
  goal: string;
  optionTitle: string;
  summary: string;
  tradeoff: string;
  notes: string;
};
type FsDirectory = FileSystemDirectoryHandle & {
  entries: () => AsyncIterable<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<FsDirectory>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandle>;
};
type FsWindow = Window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FsDirectory> };

const sampleFiles: ContextFile[] = [
  { path: "README.md", content: "# My reading list\n\nA tiny project for collecting books and marking what I have read.\n\n## Goal\n\nMake it easy to add a book, find it later, and track reading progress.\n" },
  { path: "src/App.tsx", content: "export function App() {\n  const books: string[] = [];\n\n  return (\n    <main>\n      <h1>Reading list</h1>\n      {books.length === 0 ? <p>No books yet.</p> : null}\n    </main>\n  );\n}\n" },
  { path: "src/style.css", content: "body { font-family: system-ui, sans-serif; }\nmain { max-width: 42rem; margin: 4rem auto; }\n" },
];
const decisionKey = "buld-with-me:decisions:v1";
const ignoredFolders = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", ".venv", "venv"]);
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".css", ".html", ".py", ".rs", ".go", ".toml", ".yaml", ".yml", ".sh", ".sql", ".java", ".kt", ".swift", ".rb", ".php"]);

function safeProjectPath(value: string): boolean {
  return value.length > 0 && value.length <= 180 && !value.startsWith("/") && !value.includes("\\")
    && !value.split("/").some((part) => !part || part === "." || part === "..")
    && !value.split("/").some((part) => ignoredFolders.has(part) || /^\.env/i.test(part));
}

async function scanProject(root: FsDirectory): Promise<{ files: ProjectFile[]; handles: Map<string, FileSystemFileHandle> }> {
  const files: ProjectFile[] = [];
  const handles = new Map<string, FileSystemFileHandle>();
  async function walk(directory: FsDirectory, prefix: string, depth: number) {
    if (depth > 4 || files.length >= 240) return;
    for await (const [name, entry] of directory.entries()) {
      if (ignoredFolders.has(name) || /^\.env/i.test(name)) continue;
      const relative = prefix ? `${prefix}/${name}` : name;
      if (!safeProjectPath(relative)) continue;
      if (entry.kind === "directory") {
        await walk(entry as FsDirectory, relative, depth + 1);
      } else {
        const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
        if (!allowedExtensions.has(extension) || name.endsWith(".lock")) continue;
        const handle = entry as FileSystemFileHandle;
        const file = await handle.getFile();
        if (file.size > 1_000_000) continue;
        files.push({ path: relative, size: file.size });
        handles.set(relative, handle);
      }
      if (files.length >= 240) return;
    }
  }
  await walk(root, "", 0);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, handles };
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "folder") return <svg {...common}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/><path d="M3 10h18"/></svg>;
  if (name === "spark") return <svg {...common}><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 19 6v5c0 4.8-3.1 8-7 10-3.9-2-7-5.2-7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>;
  if (name === "branch") return <svg {...common}><circle cx="7" cy="6" r="2"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/><path d="M7 8v8M17 16a4 4 0 0 0-4-4H9"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === "download") return <svg {...common}><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14m-6-6 6 6-6 6"/></svg>;
  if (name === "lock") return <svg {...common}><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>;
}

function StepProgress({ phase }: { phase: Phase }) {
  const items: { id: Phase; label: string }[] = [
    { id: "start", label: "Set a goal" },
    { id: "architecture", label: "Discuss options" },
    { id: "building", label: "Build together" },
  ];
  const active = items.findIndex((item) => item.id === phase);
  return <div className="progress-row" aria-label="Build steps">
    {items.map((item, index) => <Fragment key={item.id}>
      <div className={`progress-step ${index <= active ? "active" : ""}`} aria-current={index === active ? "step" : undefined}>
        <span>{index < active ? <Icon name="check" size={11} /> : index + 1}</span>{item.label}
      </div>
      {index < items.length - 1 && <div className="progress-line" />}
    </Fragment>)}
  </div>;
}

function OptionDiagram({ steps }: { steps: string[] }) {
  const width = 360;
  const gap = 10;
  const nodeWidth = Math.min(92, (width - gap * (steps.length - 1) - 20) / steps.length);
  const total = steps.length * nodeWidth + gap * (steps.length - 1);
  const start = (width - total) / 2;
  return <svg className="option-diagram" viewBox={`0 0 ${width} 72`} role="img" aria-label={`Architecture flow: ${steps.join(" to ")}`}>
    <title>{`Architecture flow: ${steps.join(" to ")}`}</title>
    {steps.map((step, index) => {
      const x = start + index * (nodeWidth + gap);
      return <g key={`${step}-${index}`}>
        {index > 0 && <path className="edge" d={`M ${x - gap + 1} 36 H ${x - 3}`} />}
        <rect className="node" x={x} y="21" width={nodeWidth} height="30" rx="7" />
        <text x={x + nodeWidth / 2} y="40" textAnchor="middle">{step.length > 14 ? `${step.slice(0, 12)}…` : step}</text>
      </g>;
    })}
  </svg>;
}

function readSavedDecisions(): SavedDecision[] {
  try {
    const value = localStorage.getItem(decisionKey);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as SavedDecision[] : [];
  } catch {
    return [];
  }
}

async function readContext(handles: Map<string, FileSystemFileHandle>, selected: string[]): Promise<ContextFile[]> {
  const files: ContextFile[] = [];
  for (const relativePath of selected.slice(0, 6)) {
    const handle = handles.get(relativePath);
    if (!handle) continue;
    const file = await handle.getFile();
    if (file.size > 40_000) throw new Error(`${relativePath} is larger than the 40 KB context limit. Choose a smaller file.`);
    const content = await file.text();
    if (content.includes("\0")) continue;
    files.push({ path: relativePath, content });
  }
  return files;
}

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  } : undefined);
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

export function Workspace() {
  const [mode, setMode] = useState<AppMode>("needs-credentials");
  const [projectName, setProjectName] = useState("");
  const [projectKind, setProjectKind] = useState<"sample" | "local" | null>(null);
  const [rootHandle, setRootHandle] = useState<FsDirectory | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [projectSummary, setProjectSummary] = useState("");
  const [phase, setPhase] = useState<Phase>("start");
  const [architecture, setArchitecture] = useState<Architecture | null>(null);
  const [selectedOption, setSelectedOption] = useState<Option | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [discussionDone, setDiscussionDone] = useState(false);
  const [decisionSaved, setDecisionSaved] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [savedDecisions, setSavedDecisions] = useState<SavedDecision[]>([]);
  const [continuation, setContinuation] = useState<ContinueResult | null>(null);
  const [contextAtProposal, setContextAtProposal] = useState<ContextFile[]>([]);
  const [appliedPaths, setAppliedPaths] = useState<string[]>([]);
  const [checkedVerification, setCheckedVerification] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showRecords, setShowRecords] = useState(false);
  const handlesRef = useRef(new Map<string, FileSystemFileHandle>());
  const selectedContext = useMemo(() => new Set(selectedFiles), [selectedFiles]);

  useEffect(() => {
    setSavedDecisions(readSavedDecisions());
    void request<{ mode: AppMode }>("/api/status").then((status) => setMode(status.mode)).catch(() => setMode("needs-credentials"));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const isDemo = mode === "demo";
  const canAskAi = mode === "live" || isDemo;

  function clearSession() {
    setPhase("start");
    setArchitecture(null);
    setSelectedOption(null);
    setMessages([]);
    setDiscussionDone(false);
    setDecisionSaved(false);
    setDecisionNotes("");
    setContinuation(null);
    setContextAtProposal([]);
    setAppliedPaths([]);
    setCheckedVerification([]);
    setError("");
  }

  async function chooseLocalProject() {
    setError("");
    const picker = (window as FsWindow).showDirectoryPicker;
    if (!picker) {
      setError("Project folder access needs a browser with the File System Access API, such as a current version of Chrome or Edge. The demo works in any modern browser.");
      return;
    }
    try {
      const handle = await picker({ mode: "readwrite" }) as FsDirectory;
      const scanned = await scanProject(handle);
      setRootHandle(handle);
      handlesRef.current = scanned.handles;
      setProjectFiles(scanned.files);
      setProjectName(handle.name);
      setProjectKind("local");
      setSelectedFiles([]);
      setProjectSummary("");
      clearSession();
      setToast(`Opened ${handle.name}. Choose only the files you want the AI to see.`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Could not open that project folder.");
    }
  }

  function chooseSampleProject() {
    if (!isDemo) return;
    handlesRef.current = new Map();
    setRootHandle(null);
    setProjectFiles(sampleFiles.map((file) => ({ path: file.path, size: file.content.length })));
    setSelectedFiles(sampleFiles.map((file) => file.path));
    setProjectName("Reading list · sample project");
    setProjectSummary("A tiny reading-list app that lets someone add books, search, and mark what they have read.");
    setProjectKind("sample");
    setGoal("Add a useful empty state and a simple way to find books in my reading list.");
    clearSession();
    setToast("Sample project opened. This walkthrough uses fixed examples, not live AI or real project files.");
  }

  function invalidatePlan() {
    if (phase === "start") return;
    setPhase("start");
    setArchitecture(null);
    setSelectedOption(null);
    setMessages([]);
    setDiscussionDone(false);
    setDecisionSaved(false);
    setDecisionNotes("");
    setContinuation(null);
    setContextAtProposal([]);
    setAppliedPaths([]);
    setCheckedVerification([]);
    setError("");
    setToast("Your goal or shared context changed. Compare architecture options again before building.");
  }

  function toggleContextFile(path: string) {
    invalidatePlan();
    setSelectedFiles((current) => current.includes(path) ? current.filter((item) => item !== path) : current.length >= 6 ? current : [...current, path]);
  }

  async function makeRequestBody() {
    if (!projectKind || !projectName) throw new Error("Open a project before continuing.");
    if (projectKind === "sample") {
      return { goal, projectName, projectSummary, knownFiles: sampleFiles.map((file) => file.path), context: sampleFiles.filter((file) => selectedFiles.includes(file.path)) };
    }
    return {
      goal,
      projectName,
      projectSummary,
      knownFiles: projectFiles.map((file) => file.path),
      context: rootHandle ? await readContext(handlesRef.current, selectedFiles) : [],
    };
  }

  async function startArchitecture() {
    if (busy) return;
    if (!projectKind) { setError("Open a project or choose the labeled sample first."); return; }
    if (!canAskAi) { setError("Connect an AI provider to ask for live architecture options, or restart in explicitly labeled sample mode."); return; }
    setBusy(true);
    setError("");
    try {
      const body = await makeRequestBody();
      const result = await request<Architecture>("/api/architecture", body);
      setArchitecture(result);
      setPhase("architecture");
      setSelectedOption(null);
      setDiscussionDone(false);
      setDecisionSaved(false);
      setMessages([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not generate architecture options.");
    } finally {
      setBusy(false);
    }
  }

  async function discuss(messageText: string) {
    if (!canAskAi || !architecture || !selectedOption || busy || !messageText.trim()) return;
    setBusy(true);
    setError("");
    const userMessage = messageText.trim();
    const previous = messages;
    setMessages([...previous, { role: "user", content: userMessage }]);
    setMessage("");
    try {
      const body = await makeRequestBody();
      const result = await request<ContinueResult>("/api/continue", {
        ...body,
        option: { id: selectedOption.id, title: selectedOption.title, summary: selectedOption.summary, tradeoff: selectedOption.tradeoff },
        history: previous,
        message: userMessage,
        stage: decisionSaved ? "build" : "discuss",
      });
      setMessages((current) => [...current, { role: "assistant", content: result.response }]);
      setContinuation(result);
      setContextAtProposal(body.context);
      setAppliedPaths([]);
      setCheckedVerification([]);
      if (!decisionSaved) setDiscussionDone(true);
      setPhase("building");
    } catch (cause) {
      setMessages(previous);
      setMessage(userMessage);
      setError(cause instanceof Error ? cause.message : "Could not continue the conversation.");
    } finally {
      setBusy(false);
    }
  }

  function recordDecision() {
    if (!selectedOption || !discussionDone || !projectName) return;
    const decision: SavedDecision = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      projectName,
      goal: goal.trim(),
      optionTitle: selectedOption.title,
      summary: selectedOption.summary,
      tradeoff: selectedOption.tradeoff,
      notes: decisionNotes.trim(),
    };
    const next = [decision, ...readSavedDecisions()].slice(0, 30);
    localStorage.setItem(decisionKey, JSON.stringify(next));
    setSavedDecisions(next);
    setDecisionSaved(true);
    setToast("Decision recorded in this browser only. Nothing was sent to a server.");
  }

  function exportDecision(decision: SavedDecision) {
    const markdown = `# Architecture decision: ${decision.optionTitle}\n\n- Date: ${new Date(decision.date).toLocaleDateString()}\n- Project: ${decision.projectName}\n- Goal: ${decision.goal}\n\n## Chosen direction\n\n${decision.summary}\n\n## Tradeoff considered\n\n${decision.tradeoff}\n${decision.notes ? `\n## Discussion note\n\n${decision.notes}\n` : ""}`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    link.download = `architecture-decision-${decision.date.slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function resolveFileHandle(relativePath: string, create: boolean): Promise<FileSystemFileHandle> {
    if (!rootHandle || !safeProjectPath(relativePath)) throw new Error("That path is not allowed in the selected project.");
    const parts = relativePath.split("/");
    let directory = rootHandle;
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create }) as FsDirectory;
    return directory.getFileHandle(parts.at(-1)!, { create });
  }

  async function applyFile(change: ProposedFile) {
    if (projectKind === "sample") {
      setAppliedPaths((current) => [...new Set([...current, change.path])]);
      setToast("Sample preview updated in memory only. No project file was changed.");
      return;
    }
    if (!rootHandle) { setError("Re-open the project folder before applying a change."); return; }
    if (!safeProjectPath(change.path)) { setError("This proposed path is not safe to write."); return; }
    const selectedSnapshot = contextAtProposal.find((file) => file.path === change.path);
    const knownBefore = projectFiles.some((file) => file.path === change.path);
    if (knownBefore && !selectedSnapshot) {
      setError("This file was not shared as AI context. Select it and ask again before proposing changes to it.");
      return;
    }
    try {
      const handle = await resolveFileHandle(change.path, !knownBefore);
      let actualBefore = "";
      if (knownBefore) actualBefore = await (await handle.getFile()).text();
      if (selectedSnapshot && actualBefore !== selectedSnapshot.content) {
        setError(`${change.path} changed since the AI saw it. Refresh the project context and review a new proposal instead of overwriting newer work.`);
        return;
      }
      if (!knownBefore) {
        try {
          await resolveFileHandle(change.path, false);
          setError(`${change.path} already exists but was not in the selected project snapshot. Refresh the project and ask again.`);
          return;
        } catch (cause) {
          if (!(cause instanceof DOMException && cause.name === "NotFoundError")) throw cause;
        }
      }
      const writable = await handle.createWritable();
      await writable.write(change.content);
      await writable.close();
      const written = await (await handle.getFile()).text();
      if (written !== change.content) throw new Error("The file did not match the reviewed proposal after writing; inspect it before continuing.");
      setAppliedPaths((current) => [...new Set([...current, change.path])]);
      setProjectFiles((current) => current.some((file) => file.path === change.path) ? current : [...current, { path: change.path, size: change.content.length }].sort((a, b) => a.path.localeCompare(b.path)));
      handlesRef.current.set(change.path, handle);
      setToast(`${change.path} was applied and read back for verification.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not apply ${change.path}.`);
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="Buld with me home"><span className="brand-mark">b.</span><span>buld with me</span></a>
      <div className="top-actions">
        <span className={`status-chip ${isDemo ? "demo" : ""}`}><span className="status-dot" />{isDemo ? "Sample demo" : mode === "live" ? "AI connected" : "AI setup needed"}</span>
        <button className="icon-btn" type="button" aria-label="View saved decisions" title="View saved decisions" onClick={() => setShowRecords((value) => !value)}><Icon name="branch" /></button>
      </div>
    </header>

    <section className="hero" id="top">
      <div>
        <p className="kicker">A build partner for the edge of what you know</p>
        <h1>Make something ambitious.<br /><em>Understand the choices.</em></h1>
        <p className="hero-copy">AI can take on the heavy lifting while you stay part of the architecture decisions. Learn by building, one meaningful choice at a time.</p>
      </div>
      <aside className="hero-note"><strong>Your judgment belongs in the build.</strong><p>At a consequential decision, see concrete paths and their tradeoffs. Choose together, then let implementation keep moving.</p></aside>
    </section>

    {isDemo && <aside className="demo-banner" role="status"><Icon name="info" size={17} /><div><strong>Sample mode · no live AI</strong><p>This guided reading-list example uses fixed sample responses. It does not call an AI model, access a real project folder, or write project files.</p></div></aside>}
    {mode === "needs-credentials" && <aside className="setup-box" role="status"><h3>Connect an AI provider to build with your project</h3><p>AI features are unavailable until you configure a key. Copy <code>.env.example</code> to <code>.env.local</code>, set <code>OPENAI_API_KEY</code>, then restart. Keys stay on this machine and are never included in the browser bundle.</p><p>Want to explore the interaction first? Run the explicitly labeled walkthrough with <code>DEMO_MODE=true npm run dev</code>.</p></aside>}

    <div className="workspace-grid">
      <aside className="panel project-panel" aria-label="Project and goal">
        <div className="panel-head"><div><span className="step-label">YOUR WORKSPACE</span><h2>Start with a project</h2></div><span className="step-label">01 / 03</span></div>
        <div className="project-card"><span className="folder-icon"><Icon name="folder" /></span><div style={{ minWidth: 0 }}><div className="project-name">{projectName || "No project selected"}</div><div className="project-meta">{projectKind === "sample" ? "Synthetic sample · in memory" : projectKind === "local" ? `${projectFiles.length} text files found · local only` : "Choose a folder or try the sample"}</div></div></div>
        <div className="project-actions">
          {isDemo ? <button className="button secondary full" type="button" onClick={chooseSampleProject}><Icon name="spark" size={15} />{projectKind === "sample" ? "Reset sample project" : "Try the sample project"}</button> : <button className="button secondary full" type="button" onClick={() => void chooseLocalProject()}><Icon name="folder" size={15} />{projectKind === "local" ? "Choose another folder" : "Open a project folder"}</button>}
          {projectKind === "local" && <button className="button ghost full" type="button" onClick={() => void chooseLocalProject()}>Refresh project file list</button>}
        </div>
        <p className="privacy-note"><Icon name="lock" size={14} />{isDemo ? "Sample mode never reads or writes to your device." : "Your folder stays in your browser. Only files you check below are sent to your configured AI provider."}</p>
        {projectKind === "local" && <div className="context-area">
          <label className="field-label">Choose context files <span className="file-count">({selectedFiles.length}/6 shared)</span></label>
          <p className="helper-text">Names are listed locally. File contents are read only after you select them. Secrets and common dependency folders are excluded.</p>
          {projectFiles.length ? <div className="context-list">{projectFiles.map((file) => <label className="context-file" key={file.path}>
            <input type="checkbox" checked={selectedContext.has(file.path)} disabled={!selectedContext.has(file.path) && selectedFiles.length >= 6} onChange={() => toggleContextFile(file.path)} />
            <code title={file.path}>{file.path}</code>
          </label>)}</div> : <p className="helper-text">No supported text files found yet. You can still describe the project in your own words.</p>}
        </div>}
        <div className="project-divider" />
        <label className="field-label" htmlFor="goal">What would you like to build?</label>
        <textarea id="goal" className="textarea goal-input" maxLength={1600} value={goal} onChange={(event) => { invalidatePlan(); setGoal(event.target.value); }} placeholder="Describe the goal in your own words. What should be different when we're done?" />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 7 }}><span className="helper-text">Start with the outcome, not a technical spec.</span><span className="helper-text">{goal.length}/1600</span></div>
        <div style={{ marginTop: 16 }}><label className="field-label" htmlFor="summary">A little project context <span className="helper-text">· optional</span></label><textarea id="summary" className="textarea summary-input" maxLength={800} value={projectSummary} onChange={(event) => { invalidatePlan(); setProjectSummary(event.target.value); }} placeholder="Who uses this? What already exists? Anything the AI should keep in mind?" /></div>
        <button className="button full" style={{ marginTop: 17 }} type="button" disabled={!projectKind || !goal.trim() || busy || !canAskAi} onClick={() => void startArchitecture()}><Icon name="spark" size={16} />{busy && phase === "start" ? <><span className="spinner" />Thinking through options…</> : "Explore architecture options"}<Icon name="arrow" size={15} /></button>
        <p className="helper-text" style={{ margin: "9px 2px 0" }}>Two possible approaches, one grounded conversation. No changes are made at this step.</p>
      </aside>

      <main className="panel main-panel">
        <StepProgress phase={phase} />
        {error && <div className="error-box" role="alert">{error}</div>}
        {phase === "start" && <section className="empty-state">
          <div className="empty-art"><Icon name="spark" size={24} /></div>
          <h3>First, tell the AI what matters.</h3>
          <p>Choose or open a project, describe what you want to build, and share only the context files you want the AI to see. Then compare two visual approaches before anything changes.</p>
          <div className="requirement-callout" style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}><span className="callout-icon"><Icon name="shield" size={16} /></span><span>No project files change until you inspect and explicitly apply a proposed file. This app never runs a project command.</span></div>
        </section>}

        {phase === "architecture" && architecture && <section>
          <div className="section-heading"><div><span className="step-label">02 / 03 · ARCHITECTURE</span><h2 style={{ marginTop: 7 }}>Two ways to approach it</h2></div><span className={`status-chip ${architecture.mode === "demo" ? "demo" : ""}`}><span className="status-dot" />{architecture.mode === "demo" ? "Sample options" : "AI generated"}</span></div>
          <p className="section-description">{architecture.framing} Select one to discuss. A diagram shows the shape; examples and tradeoffs make the choice concrete.</p>
          <div className="options-grid">{architecture.options.map((option, index) => <article className={`option-card ${selectedOption?.id === option.id ? "selected" : ""}`} key={option.id}>
            <div className="option-top"><span className="option-kicker">PATH {String.fromCharCode(65 + index)}</span><input className="option-radio" type="radio" name="architecture" aria-label={`Choose ${option.title}`} checked={selectedOption?.id === option.id} onChange={() => setSelectedOption(option)} /></div>
            <h3>{option.title}</h3><p className="option-summary">{option.summary}</p>
            <OptionDiagram steps={option.steps} />
            <p className="option-tradeoff"><strong>Tradeoff</strong> · {option.tradeoff}</p>
            <p className="option-example"><strong>For example</strong> · {option.example}</p>
          </article>)}</div>
          <div className="recommendation"><strong>Build partner's take</strong> · {architecture.recommendation}</div>
          <div className="choice-bar"><p>{architecture.question}</p><button className="button" type="button" disabled={!selectedOption} onClick={() => { setMessages([]); setPhase("building"); setDiscussionDone(false); }}><Icon name="branch" size={15} />Discuss selected path<Icon name="arrow" size={14} /></button></div>
        </section>}

        {phase === "building" && <section>
          {architecture && selectedOption ? <>
            <div className="section-heading"><div><span className="step-label">03 / 03 · BUILD TOGETHER</span><h2 style={{ marginTop: 7 }}>Keep the decision visible</h2></div><button className="button ghost small" type="button" onClick={invalidatePlan}>Compare paths</button></div>
            <p className="section-description">Chosen direction: <strong>{selectedOption.title}</strong>. Discuss the tradeoff, record the choice, and then ask the AI to continue. Changes stay reviewable until you apply them.</p>
            {discussionDone && !decisionSaved && <label style={{ display: "block", margin: "13px 0" }}><span className="field-label">Why does this option fit? <span className="helper-text">· optional, saved only on this device</span></span><textarea className="textarea" maxLength={600} value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} placeholder="What convinced you? What would you revisit later?" /></label>}
            <div className="choice-bar" style={{ alignItems: "center" }}><p><strong>{selectedOption.title}</strong><br />{selectedOption.tradeoff}</p>{!decisionSaved ? <button className="button secondary small" type="button" disabled={!discussionDone} title={!discussionDone ? "Discuss this path first" : "Record decision on this device"} onClick={recordDecision}><Icon name="branch" size={14} />Record this decision</button> : <span className="status-chip"><span className="status-dot" />Saved locally</span>}</div>
            {!discussionDone && <div className="helper-text" style={{ marginTop: 8 }}>Ask one question about the tradeoff, then decide whether this is the path you want.</div>}
            {decisionSaved && <div className="decision-saved" role="status"><Icon name="check" size={17} /><div><strong>Decision recorded in this browser.</strong>The goal, selected option, and your short note are saved locally. Export a Markdown copy below if you want it with the project.</div></div>}
            <div className="chat-thread" aria-live="polite">{messages.map((item, index) => <div key={`${item.role}-${index}`} className={`chat-message ${item.role}`}><span className="chat-role">{item.role === "user" ? "You" : isDemo ? "Sample build partner · not AI" : "Build partner"}</span>{item.content}</div>)}</div>
            {continuation && <>
              {continuation.files.length > 0 ? <div className="requirement-callout"><span className="callout-icon"><Icon name="info" size={16} /></span><span>{continuation.mode === "demo" ? "SAMPLE CHANGE ONLY · The preview below is fixed sample content. Apply updates this in-memory walkthrough only." : "REVIEW FIRST · AI suggestions are previews. Inspect each change; nothing is written until you apply it."}</span></div> : <div className="requirement-callout"><span className="callout-icon"><Icon name="info" size={16} /></span><span>This turn was for discussion only. No file changes were proposed. Record your choice before asking the AI to build.</span></div>}
              {continuation.files.map((change) => {
                const original = contextAtProposal.find((file) => file.path === change.path)?.content ?? "(new file)";
                const isApplied = appliedPaths.includes(change.path);
                return <article className="change-card" key={change.path}>
                  <div className="change-header"><div><strong>{change.path}</strong><p>{change.reason}</p></div><span className="badge" style={{ border: "1px solid #dce5e3", borderRadius: 99, padding: "4px 8px", color: isApplied ? "#17604c" : "#786028", background: isApplied ? "#edf9f4" : "#fff8e9", fontSize: 9 }}>{isApplied ? continuation.mode === "demo" ? "Sample preview updated" : "Applied + read back" : "Preview only"}</span></div>
                  <div className="diff-grid"><div className="diff-column"><span className="diff-label">Before</span><pre className="diff-code">{original || "(empty file)"}</pre></div><div className="diff-column"><span className="diff-label">Proposed</span><pre className="diff-code after">{change.content}</pre></div></div>
                  <div className="change-footer"><p>{isApplied ? continuation.mode === "demo" ? "No project file was written." : "The file was re-read and matched this proposal." : "Review the complete contents before applying."}</p><button className={`button small ${isApplied ? "secondary" : ""}`} type="button" disabled={isApplied || busy} onClick={() => void applyFile(change)}>{isApplied ? <><Icon name="check" size={14} />Verified</> : continuation.mode === "demo" ? "Apply to sample only" : "Apply this file"}</button></div>
                </article>;
              })}
              {continuation.verification.length > 0 && <div style={{ marginTop: 18 }}><div className="section-heading"><div><span className="step-label">CHECK YOUR WORK</span><h2 style={{ marginTop: 5, fontSize: 16 }}>Suggested verification</h2></div><span className="badge" style={{ background: "#f2f5f4", color: "#60706e", borderRadius: 99, padding: "5px 8px", fontSize: 9 }}>You run these</span></div><p className="helper-text">The app does not execute project commands. Run a check yourself in your project terminal and mark it only when you have observed the result.</p><div className="verification-list">{continuation.verification.map((item, index) => <label className={`verify-item ${checkedVerification.includes(index) ? "done" : ""}`} key={`${item.label}-${index}`}><input type="checkbox" checked={checkedVerification.includes(index)} onChange={() => setCheckedVerification((current) => current.includes(index) ? current.filter((i) => i !== index) : [...current, index])} /><span>{item.label}<code>{item.command}</code></span></label>)}</div></div>}
            </>}
            {decisionSaved && <div className="input-row" style={{ marginTop: 15 }}><textarea className="textarea" aria-label="Continue building prompt" maxLength={1600} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void discuss(message); }} placeholder="What should the AI build or explain next? Be as ambitious as you like." /><button className="button" type="button" disabled={!message.trim() || busy} onClick={() => void discuss(message)}>{busy ? <><span className="spinner" />Working…</> : <><Icon name="arrow" size={15} />Continue building</>}</button></div>}
            {!decisionSaved && <div className="input-row" style={{ marginTop: 15 }}><textarea className="textarea" aria-label="Discuss the architecture choice" maxLength={1600} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void discuss(message); }} placeholder="What tradeoff should we think through before choosing?" /><button className="button" type="button" disabled={!message.trim() || busy} onClick={() => void discuss(message)}>{busy ? <><span className="spinner" />Thinking…</> : <><Icon name="arrow" size={15} />Discuss</>}</button></div>}
            {decisionSaved && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 9 }}><button className="button ghost small" type="button" onClick={() => { const saved = readSavedDecisions()[0]; if (saved) exportDecision({ ...saved, notes: decisionNotes }); }}>Export decision note</button></div>}
          </> : <div className="empty-state"><div className="empty-art"><Icon name="branch" size={23} /></div><h3>Choose an architecture path first.</h3><p>Compare two concrete options and select one to discuss before continuing.</p></div>}
        </section>}

        {showRecords && <section style={{ marginTop: phase === "start" ? 25 : 32, paddingTop: 19, borderTop: "1px solid var(--line)" }}><div className="section-heading"><div><span className="step-label">THIS BROWSER ONLY</span><h2 style={{ marginTop: 6 }}>Saved architecture decisions</h2></div><button className="button ghost small" type="button" onClick={() => setShowRecords(false)}>Close</button></div>{savedDecisions.length ? <div className="record-list">{savedDecisions.map((decision) => <div className="record-row" key={decision.id}><div><strong>{decision.optionTitle}</strong><span>{decision.projectName} · {new Date(decision.date).toLocaleDateString()}</span></div><button className="button secondary small" type="button" onClick={() => exportDecision(decision)}><Icon name="download" size={13} />Export</button></div>)}</div> : <p className="helper-text">No saved decisions yet. A decision is stored only after you discuss and record a selected option.</p>}</section>}
      </main>
    </div>
    <footer className="footer"><span>Local-first by default. You choose what context to share and what changes to apply.</span><span>Conversation isn't stored by this app. <a href="https://github.com/lpedenon/buld-with-me" target="_blank" rel="noreferrer">Project source</a></span></footer>
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}
