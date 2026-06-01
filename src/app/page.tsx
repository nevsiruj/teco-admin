"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Types ──
interface EconomicEvent {
  id: string; workerName?: string | null; workerPhone?: string | null;
  economicKind?: string | null; category?: string | null; amount?: number | null;
  currency?: string; paymentStatus?: string | null; executionStatus?: string | null;
  location?: string | null; description?: string | null; pgOrExternalRef?: string | null;
  originChannel?: string | null; createdAt?: string; source?: string;
}
interface Metrics { totalEvents: number; totalAmount: number; collectedAmount: number; pendingAmount: number; }
interface User { id: string; name?: string | null; phone?: string; source?: string; createdAt?: string; updatedAt?: string; lastSeenAt?: string; }
interface Suggestion { id: string; source?: string; summary?: string; severity?: string; businessContextAddition?: string; interpretationRuleAddition?: string; status?: string; createdAt?: string; }
interface OwnerContext { systemPrompt?: string; promptTemplate?: string; businessContext?: string; interpretationRules?: string; }
interface AppState {
  events: EconomicEvent[]; users: User[]; suggestions: Suggestion[]; ownerContext: OwnerContext;
  metrics: Metrics; llm: { mode: string; provider?: string }; trii: { configured: boolean; endpoint?: string };
  storage: { mode: string };
  remote?: { enabled: boolean; source?: string };
}
interface LLMResult {
  summary?: string; reply?: string; model?: string; provider?: string;
  normalizedEvent: EconomicEvent; tracking?: any; llmMode?: string;
}

const NAV = [
  { id: "resumen", icon: "📊", label: "Resumen" },
  { id: "probar-agente", icon: "💬", label: "Probar agente" },
  { id: "comportamiento", icon: "🧠", label: "Comportamiento" },
  { id: "trabajadores", icon: "👥", label: "Trabajadores" },
  { id: "conversaciones", icon: "📝", label: "Conversaciones" },
  { id: "eventos", icon: "📦", label: "Eventos" },
  { id: "aprendizajes", icon: "💡", label: "Aprendizajes" },
  { id: "sistema", icon: "⚙️", label: "Sistema" },
];

// ── Helpers ──
function safeStr(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return (v as any).address || (v as any).name || JSON.stringify(v);
  return String(v);
}
function fmtCurrency(n: number | null | undefined) { return n == null ? "—" : "$ " + n.toLocaleString("es-AR"); }
function fmtDate(s: string | null | undefined) { if (!s) return "—"; const d = new Date(s); return isNaN(+d) ? s : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }); }
function labelKind(k?: string | null) { const m: Record<string, string> = { venta: "Venta", cobro: "Cobro", servicio: "Servicio", deposito: "Depósito", transferencia: "Transferencia", costo: "Costo", gasto: "Gasto", pago: "Pago" }; return m[k || ""] || k || "—"; }
function labelPayment(s?: string | null) { const m: Record<string, string> = { cobrado: "Cobrado ✅", pendiente_cobro: "Pendiente 🟡", cancelado: "Cancelado", enviado: "Enviado", paid: "Cobrado ✅", pending: "Pendiente 🟡" }; return m[s || ""] || s || "—"; }
function labelExec(s?: string | null) { const m: Record<string, string> = { ejecutado: "Ejecutado ✅", pendiente_ejecucion: "Pendiente ⏳", en_curso: "En curso 🔄", realizado: "Realizado ✅" }; return m[s || ""] || s || "—"; }
function limpiarNumero(v?: string | null) { if (!v) return "—"; return v.replace(/\D/g, "").replace(/^549/, "").replace(/^54/, "").replace(/^0/, ""); }

// ── Main Component ──
export default function Dashboard() {
  const router = useRouter();
  const [state, setState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState("resumen");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Probar agente
  const [workerName, setWorkerName] = useState("Juan");
  const [workerPhone, setWorkerPhone] = useState("1122334455");
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<LLMResult | null>(null);

  // Context editing
  const [ctxTab, setCtxTab] = useState<"business" | "rules" | "welcome" | "dataprivacy" | "template">("business");
  const [ctxDraft, setCtxDraft] = useState("");
  const [savingCtx, setSavingCtx] = useState(false);

  // Suggestions
  const [editingSugId, setEditingSugId] = useState<string | null>(null);
  const [sugField, setSugField] = useState<"business" | "rules">("business");
  const [sugDraft, setSugDraft] = useState("");

  // Trii
  const [triiNumber, setTriiNumber] = useState("");
  const [triiText, setTriiText] = useState("");
  const [triiSending, setTriiSending] = useState(false);
  const [triiResult, setTriiResult] = useState("");

  // Status toast
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (res.status === 401 || res.status === 307) { router.replace("/login"); return; }
      const data = await res.json();
      setState(data);
      setError("");
    } catch { setError("No se pudo conectar al servidor."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { loadState(); const iv = setInterval(loadState, 60000); return () => clearInterval(iv); }, [loadState]);

  // Auto-dismiss toast
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  // Sync context draft
  useEffect(() => {
    if (!state) return;
    if (ctxTab === "business") setCtxDraft(state.ownerContext.businessContext || "");
    else if (ctxTab === "rules") setCtxDraft(state.ownerContext.interpretationRules || "");
    else if (ctxTab === "welcome") setCtxDraft(state.ownerContext.welcomeMessage || "");
    else if (ctxTab === "dataprivacy") setCtxDraft(state.ownerContext.dataUsageNotice || "");
    else setCtxDraft(state.ownerContext.promptTemplate || "");
  }, [state, ctxTab]);

  function showToast(type: string, message: string) { setToast({ type, message }); }

  // ── Actions ──
  async function handleTestAgent() {
    setSending(true); setResult(null);
    try {
      const res = await fetch("/api/process", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerName, workerPhone, message: testMessage }),
      });
      const data = await res.json();
      setResult(data);
      loadState();
    } catch { showToast("error", "No se pudo procesar el mensaje."); }
    finally { setSending(false); }
  }
  async function handleSaveContext() {
    setSavingCtx(true);
    try {
      const keyMap: Record<string, string> = { business: "businessContext", rules: "interpretationRules", welcome: "welcomeMessage", dataprivacy: "dataUsageNotice", template: "promptTemplate" };
      const key = keyMap[ctxTab] || "promptTemplate";
      await fetch("/api/context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: ctxDraft }),
      });
      showToast("success", "Guardado ✅");
      loadState();
    } catch { showToast("error", "No se pudo guardar."); }
    finally { setSavingCtx(false); }
  }
  async function handleApproveSug(id: string) {
    const sug = state?.suggestions.find((s) => s.id === id);
    const edits: Record<string, string> = {};
    if (sug && sugField === "business" && sugDraft) edits.businessContextAddition = sugDraft;
    if (sug && sugField === "rules" && sugDraft) edits.interpretationRuleAddition = sugDraft;
    if (sugDraft) {
      await fetch(`/api/learning-suggestions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...edits }) });
    }
    await fetch(`/api/learning-suggestions/${id}/approve`, { method: "POST" });
    showToast("success", "Sugerencia aprobada ✅");
    setEditingSugId(null); setSugDraft("");
    loadState();
  }
  async function handleRejectSug(id: string) {
    await fetch(`/api/learning-suggestions/${id}/reject`, { method: "POST" });
    showToast("info", "Sugerencia descartada");
    setEditingSugId(null);
    loadState();
  }
  async function handleDeleteEvent(id: string) {
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    showToast("info", "Evento eliminado");
    loadState();
  }
  async function handleClearEvents() {
    if (!confirm("¿Eliminar TODOS los eventos?")) return;
    await fetch("/api/events", { method: "DELETE" });
    showToast("info", "Todos los eventos eliminados");
    loadState();
  }
  async function handleExportCSV() {
    window.open("/api/export.csv", "_blank");
  }
  async function handleSendTrii() {
    if (!triiNumber || !triiText) return;
    setTriiSending(true);
    try {
      const res = await fetch("/api/trii/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: triiNumber, text: triiText }),
      });
      const data = await res.json();
      setTriiResult(data.ok ? "✅ Mensaje enviado correctamente" : `❌ ${data.error}`);
    } catch { setTriiResult("❌ Error de conexión"); }
    finally { setTriiSending(false); }
  }
  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  async function handleMarkCollected(id: string) {
    await fetch(`/api/events/${id}/collect`, { method: "POST" });
    showToast("success", "Evento marcado como cobrado ✅");
    loadState();
  }

  // ── Computed ──
  const safeEvents = state?.events || [];
  const today = new Date().toISOString().slice(0, 10);
  const eventsToday = safeEvents.filter((e) => e.createdAt?.slice(0, 10) === today);
  const collected = safeEvents.filter((e) => e.paymentStatus === "cobrado");
  const pending = safeEvents.filter((e) => e.paymentStatus === "pendiente_cobro");
  const withWorker = safeEvents.filter((e) => e.workerName || e.workerPhone);
  const uniqueWorkers = new Map<string, EconomicEvent>();
  withWorker.forEach((e) => { const key = (e.workerPhone || e.workerName || "").toLowerCase(); if (!uniqueWorkers.has(key)) uniqueWorkers.set(key, e); });
  const uniqueList = Array.from(uniqueWorkers.values());
  const m = state?.metrics;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{background: "linear-gradient(135deg, #0a2d18 0%, #0d3d24 30%, #145a36 60%, #0d3d24 100%)"}}>
      <div className="text-center animate-fade-up">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm text-white text-3xl font-black mb-5 shadow-lg border border-white/10">T</div>
        <p className="text-white/70 text-lg font-medium">Cargando…</p>
        <div className="mt-4 w-48 mx-auto h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-white/30 rounded-full animate-pulse" style={{width:"60%"}} />
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg">
      <div className="text-center p-8 bg-white rounded-2xl shadow-xl max-w-sm border border-brand-border">
        <p className="text-4xl mb-4">⚠️</p>
        <p className="text-red-600 text-base font-semibold mb-5">{error}</p>
        <button onClick={loadState} className="px-6 py-3 rounded-xl bg-linear-to-r from-brand-orange to-amber-600 text-white font-semibold shadow-lg shadow-brand-orange/25 hover:shadow-brand-orange/40 hover:brightness-110 active:scale-[0.98] transition-all">
          Reintentar
        </button>
      </div>
    </div>
  );

  if (!state) return null;

  return (
    <div className="min-h-screen flex bg-brand-bg">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3.5 rounded-xl shadow-2xl text-sm font-medium animate-fade-up border ${
          toast.type === "success" ? "bg-green-800 text-white border-green-700" :
          toast.type === "error" ? "bg-red-700 text-white border-red-600" :
          "bg-brand-green-dark text-white border-brand-green"
        }`}>{toast.type === "success" ? "✅ " : toast.type === "error" ? "❌ " : "ℹ️ "}{toast.message}</div>
      )}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? "w-72" : "w-[76px]"} transition-all duration-300 ease-in-out flex flex-col flex-shrink-0 shadow-2xl overflow-hidden relative`}
        style={{background: "linear-gradient(180deg, #1a6b42 0%, #228b56 50%, #1a6b42 100%)"}}>

        {/* Subtle glass overlay */}
        <div className="absolute inset-0 bg-white/[0.03] pointer-events-none" />

        {/* Logo area */}
        <div className={`relative p-6 flex items-center ${sidebarOpen ? "gap-3.5" : "flex-col gap-2"}`}>
          <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-white text-xl font-black flex-shrink-0 border border-white/15">
            T
          </div>
          {sidebarOpen && (
            <div>
              <span className="text-xl font-black tracking-wider text-white block">Admin Interno</span>
            </div>
          )}
          {sidebarOpen ? (
            <button onClick={() => setSidebarOpen(false)} className="ml-auto w-7 h-7 rounded-lg bg-white/[0.1] hover:bg-white/[0.2] text-white/50 hover:text-white transition-all flex items-center justify-center border border-white/[0.08]">
              <span className="text-xs">◀</span>
            </button>
          ) : (
            <button onClick={() => setSidebarOpen(true)} className="w-10 h-10 rounded-xl bg-white/[0.12] hover:bg-white/[0.22] text-white/70 hover:text-white transition-all flex items-center justify-center border border-white/[0.1] cursor-pointer" title="Expandir menú">
              <span className="text-sm">▶</span>
            </button>
          )}
        </div>

        <div className="h-px bg-white/[0.12] mx-5" />

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto relative">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveTab(n.id)}
              className={`group w-full flex items-center ${sidebarOpen ? "gap-3.5 px-3.5" : "justify-center px-0"} py-3 rounded-xl text-sm transition-all duration-150 relative ${
                activeTab === n.id
                  ? "bg-white/[0.18] text-white font-semibold"
                  : "hover:bg-white/[0.08] text-white/70 hover:text-white"
              }`}
            >
              {activeTab === n.id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-brand-orange shadow-sm shadow-brand-orange/60" />
              )}
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 transition ${
                activeTab === n.id ? "bg-white/[0.15]" : "bg-transparent group-hover:bg-white/[0.06]"
              }`}>{n.icon}</span>
              {sidebarOpen && <span className="tracking-wide">{n.label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        {sidebarOpen && (
          <div className="relative px-3 pb-4">
            <div className="p-4 rounded-2xl bg-white/[0.08] border border-white/[0.1]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-orange to-amber-400 flex items-center justify-center text-white text-sm font-bold shadow-sm border border-white/10">A</div>
                <div>
                  <p className="text-sm font-semibold text-white/95">Admin</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-brand-bg">
        <header className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl border-b border-brand-border/60 px-8 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-brand-green-dark tracking-tight">{NAV.find((n) => n.id === activeTab)?.label}</h1>
          <div className="flex items-center gap-4 text-xs text-brand-muted">
            <button onClick={handleLogout} className="px-4 py-2 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100 active:scale-95 transition-all">Salir</button>
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto space-y-8">
          {/* ═══ RESUMEN ═══ */}
          {activeTab === "resumen" && (
            <div className="space-y-6 animate-fade-up">
              {/* Hero */}
              <div className="relative overflow-hidden p-8 bg-linear-to-br from-brand-green-dark via-brand-green to-brand-green-light rounded-2xl text-white shadow-xl">
                <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/[0.04]" />
                <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/[0.04]" />
                <div className="relative">
                  <h2 className="text-3xl font-black tracking-tight mb-1">Buenos días, admin</h2>
                  <p className="text-white/60 text-sm">{new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</p>
                  <div className="flex gap-6 mt-5">
                    <div>
                      <p className="text-3xl font-extrabold">{safeEvents.length}</p>
                      <p className="text-xs text-white/60 uppercase tracking-wider">eventos</p>
                    </div>
                    <div className="w-px bg-white/20" />
                    <div>
                      <p className="text-3xl font-extrabold">{fmtCurrency(m?.totalAmount ?? null)}</p>
                      <p className="text-xs text-white/60 uppercase tracking-wider">registrados</p>
                    </div>
                    <div className="w-px bg-white/20" />
                    <div>
                      <p className="text-3xl font-extrabold">{pending.length}</p>
                      <p className="text-xs text-white/60 uppercase tracking-wider">pendientes</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: "Hoy", value: eventsToday.length, sub: "eventos", color: "border-brand-green" },
                  { label: "Cobrado", value: collected.length, sub: fmtCurrency(collected.reduce((s, e) => s + (Number(e.amount) || 0), 0)), color: "border-green-500" },
                  { label: "Pendiente", value: pending.length, sub: fmtCurrency(pending.reduce((s, e) => s + (Number(e.amount) || 0), 0)), color: "border-yellow-500" },
                  { label: "Cancelado", value: safeEvents.filter((e) => e.paymentStatus === "cancelado").length, sub: "eventos", color: "border-red-400" },
                  { label: "Trabajadores", value: uniqueList.length, sub: "únicos", color: "border-brand-orange" },
                ].map((kpi) => (
                  <div key={kpi.label} className={`p-5 bg-white rounded-2xl border border-brand-border border-l-4 ${kpi.color} shadow-sm hover:shadow-md transition-shadow`}>
                    <p className="text-xs text-brand-muted font-semibold uppercase tracking-wider">{kpi.label}</p>
                    <p className="text-3xl font-extrabold text-brand-green-dark mt-1">{kpi.value}</p>
                    <p className="text-xs text-brand-muted mt-0.5">{kpi.sub}</p>
                  </div>
                ))}
              </div>
              {/* Recent events */}
              <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-6">
                <h3 className="font-bold text-brand-green-dark mb-5">Últimos eventos</h3>
                <div className="space-y-2">
                  {safeEvents.slice(0, 6).map((e) => (
                    <div key={e.id} className="flex items-center gap-4 p-4 rounded-xl bg-brand-bg hover:bg-brand-border/40 transition-colors group">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${e.paymentStatus === "cobrado" ? "bg-green-500" : e.paymentStatus === "pendiente_cobro" ? "bg-yellow-500" : "bg-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{safeStr(e.workerName)} · {e.category || e.economicKind || "—"}</p>
                        <p className="text-xs text-brand-muted">{fmtDate(e.createdAt)} · {safeStr(e.location)}</p>
                      </div>
                      <span className="text-sm font-bold text-brand-green-dark tabular-nums">{fmtCurrency(e.amount)}</span>
                    </div>
                  ))}
                  {safeEvents.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-4xl mb-3">📭</p>
                      <p className="text-sm text-brand-muted">No hay eventos registrados aún.</p>
                      <p className="text-xs text-brand-muted/60 mt-1">Usá &quot;Probar agente&quot; para generar datos.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ PROBAR AGENTE ═══ */}
          {activeTab === "probar-agente" && (
            <div className="space-y-6 animate-fade-up">
              <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-7">
                <h3 className="font-bold text-brand-green-dark mb-5 text-lg">Probar interpretación</h3>
                <div className="grid md:grid-cols-2 gap-5 mb-5">
                  <div>
                    <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Nombre del trabajador</label>
                    <input value={workerName} onChange={(e) => setWorkerName(e.target.value)} className="w-full mt-2 px-4 py-3 rounded-xl border border-brand-border bg-brand-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition" placeholder="Ej: Juan Pérez" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Teléfono</label>
                    <input value={workerPhone} onChange={(e) => setWorkerPhone(e.target.value)} className="w-full mt-2 px-4 py-3 rounded-xl border border-brand-border bg-brand-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition" placeholder="Ej: 1122334455" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Mensaje del trabajador</label>
                  <textarea value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={4} className="w-full mt-2 px-4 py-3 rounded-xl border border-brand-border bg-brand-bg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition" placeholder='Ej: "Hoy cobré 25000 pesos por el service en Av. Siempreviva 742, pagó en efectivo." 🤖' />
                </div>
                <button onClick={handleTestAgent} disabled={!testMessage.trim() || sending} className="mt-5 px-7 py-3 rounded-xl bg-linear-to-r from-brand-orange to-amber-600 text-white font-semibold shadow-lg shadow-brand-orange/20 hover:shadow-brand-orange/40 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {sending ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando…
                    </span>
                  ) : "Probar agente"}
                </button>
              </div>

              {result && (
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-6 space-y-4">
                    <h3 className="text-sm font-bold text-brand-green-dark flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-brand-green/10 flex items-center justify-center text-base">📋</span>
                      Resultado
                    </h3>
                    <div className="space-y-3 text-sm">
                      {[
                        { label: "Tipo", value: labelKind(result.normalizedEvent.economicKind) },
                        { label: "Categoría", value: result.normalizedEvent.category || "—" },
                        { label: "Monto", value: result.normalizedEvent.amount != null ? fmtCurrency(result.normalizedEvent.amount) : "—" },
                        { label: "Moneda", value: result.normalizedEvent.currency || "—" },
                        { label: "Pago", value: labelPayment(result.normalizedEvent.paymentStatus) },
                        { label: "Ejecución", value: labelExec(result.normalizedEvent.executionStatus) },
                        { label: "Ubicación", value: safeStr(result.normalizedEvent.location) },
                        { label: "Detalles", value: result.normalizedEvent.description || "—" },
                      ].map((r) => (
                        <div key={r.label} className="flex justify-between items-center py-1.5 border-b border-brand-border/40 last:border-0">
                          <span className="text-brand-muted text-xs uppercase tracking-wider">{r.label}</span>
                          <span className="font-semibold text-brand-text">{r.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 p-4 rounded-xl bg-brand-green-dark/5 border border-brand-green/10 text-sm text-brand-text">
                      <p className="font-semibold text-brand-green-dark text-xs uppercase tracking-wider mb-2">Respuesta:</p>
                      <p className="text-brand-muted">{result.reply}</p>
                    </div>
                    <p className="text-xs text-brand-muted/60">Modelo: {result.llmMode || "—"} · {result.model || "—"}</p>
                  </div>
                  {result.tracking && (
                    <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-6">
                      <h3 className="text-sm font-bold text-brand-green-dark flex items-center gap-2 mb-5">
                        <span className="w-8 h-8 rounded-lg bg-brand-orange/10 flex items-center justify-center text-base">📈</span>
                        Tracking del trabajador
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Total eventos", value: result.tracking.totalEvents },
                          { label: "Monto cobrado", value: fmtCurrency(result.tracking.totalCollected), accent: true },
                          { label: "Eventos cobrados", value: result.tracking.collectedEvents },
                          { label: "Eventos pendientes", value: result.tracking.pendingEvents },
                          { label: "Monto pendiente", value: fmtCurrency(result.tracking.pendingCollectionEvents) },
                        ].map((t) => (
                          <div key={t.label} className={`p-4 rounded-xl ${t.accent ? "bg-green-50 border border-green-200" : "bg-brand-bg border border-brand-border/50"}`}>
                            <p className="text-xs text-brand-muted font-medium">{t.label}</p>
                            <p className={`text-xl font-extrabold mt-1 ${t.accent ? "text-green-700" : "text-brand-green-dark"}`}>{t.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ COMPORTAMIENTO ═══ */}
          {activeTab === "comportamiento" && (
            <div className="space-y-6 animate-fade-up">
              <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-7">
                <div className="flex gap-1.5 mb-6 p-1 bg-brand-bg rounded-xl w-fit flex-wrap">
                  {([["business", "💼 Negocio"], ["rules", "📏 Reglas"], ["welcome", "👋 Bienvenida"], ["dataprivacy", "🔒 Datos"], ["template", "📝 Prompt"]] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setCtxTab(key)} className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      ctxTab === key
                        ? "bg-linear-to-r from-brand-green to-brand-green-light text-white shadow-sm"
                        : "text-brand-muted hover:text-brand-text hover:bg-white"
                    }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid 2xl:grid-cols-2 gap-6">
                  <div>
                    <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 block">
                      {ctxTab === "business" ? "Descripción del negocio" : ctxTab === "rules" ? "Reglas de interpretación" : ctxTab === "welcome" ? "Mensaje de bienvenida (primera vez)" : ctxTab === "dataprivacy" ? "Aviso de privacidad de datos" : "Template del prompt"}
                    </label>
                    <textarea value={ctxDraft} onChange={(e) => setCtxDraft(e.target.value)} rows={ctxTab === "template" ? 16 : 6} className={`w-full px-4 py-3.5 rounded-xl border border-brand-border bg-brand-bg text-sm resize-y leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition ${ctxTab === "template" ? "font-mono" : ""}`} />
                    <div className="flex items-center gap-3 mt-4">
                      <button onClick={handleSaveContext} disabled={savingCtx} className="px-6 py-2.5 rounded-xl bg-brand-green text-white font-semibold hover:bg-brand-green/90 active:scale-95 shadow-sm shadow-brand-green/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        {savingCtx ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Guardando…
                          </span>
                        ) : "Guardar"}
                      </button>
                    </div>
                  </div>
                  <div className="p-5 rounded-xl bg-brand-bg border border-brand-border/50 text-xs text-brand-muted space-y-3">
                    <h4 className="text-sm font-bold text-brand-green-dark flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-brand-orange/10 flex items-center justify-center text-sm">💡</span>
                      Tips
                    </h4>
                    <p><span className="font-semibold text-brand-text">Negocio:</span> Descripción general del negocio.</p>
                    <p><span className="font-semibold text-brand-text">Reglas:</span> Cómo interpretar categorías y montos.</p>
                    <p><span className="font-semibold text-brand-text">Bienvenida:</span> Mensaje que recibe el trabajador al contactar por primera vez.</p>
                    <p><span className="font-semibold text-brand-text">Datos:</span> Aviso sobre uso de datos que se incluye en la bienvenida.</p>
                    <p><span className="font-semibold text-brand-text">Prompt:</span> Template enviado al modelo con variables.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TRABAJADORES ═══ */}
          {activeTab === "trabajadores" && (
            <div className="space-y-6 animate-fade-up">
              {/* Worker selector */}
              <div className="grid 2xl:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-6">
                  <h3 className="font-bold text-brand-green-dark mb-5 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-brand-green/10 flex items-center justify-center text-sm">👷</span>
                    Trabajadores
                  </h3>
                  {uniqueList.length === 0 && (
                    <div className="text-center py-10">
                      <p className="text-3xl mb-2">👥</p>
                      <p className="text-sm text-brand-muted">No hay trabajadores aún.</p>
                    </div>
                  )}
                  <div className="space-y-3">
                    {uniqueList.map((e) => {
                      const nm = e.workerName || e.workerPhone || "Sin nombre";
                      const ph = limpiarNumero(e.workerPhone);
                      const evts = safeEvents.filter((x) => (x.workerPhone && x.workerPhone === e.workerPhone) || (x.workerName && x.workerName.toLowerCase() === (e.workerName || "").toLowerCase()));
                      const cash = evts.filter((x) => x.paymentStatus === "cobrado").reduce((s, x) => s + (Number(x.amount) || 0), 0);
                      const pend = evts.filter((x) => x.paymentStatus === "pendiente_cobro").reduce((s, x) => s + (Number(x.amount) || 0), 0);
                      return (
                        <div key={(e.workerPhone || e.workerName || "") + e.id} className="p-4 rounded-xl bg-brand-bg hover:bg-brand-border/40 transition-colors border border-brand-border/30">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-bold text-brand-green-dark">{nm}</p>
                            <span className="text-xs text-brand-muted tabular-nums">{evts.length} eventos</span>
                          </div>
                          <p className="text-xs text-brand-muted mb-3">{ph !== "—" ? ph : "Sin teléfono"}</p>
                          <div className="flex gap-2">
                            <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold border border-green-200">Cobrado: {fmtCurrency(cash)}</span>
                            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200">Pendiente: {fmtCurrency(pend)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Trii send */}
                {state.trii.configured && (
                  <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-6">
                    <h3 className="font-bold text-brand-green-dark mb-5 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-lg bg-brand-orange/10 flex items-center justify-center text-sm">📱</span>
                      Enviar Trii
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Nº Trii</label>
                        <input value={triiNumber} onChange={(e) => setTriiNumber(e.target.value)} className="w-full mt-2 px-4 py-3 rounded-xl border border-brand-border bg-brand-bg text-sm focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Placa Trii</label>
                        <textarea value={triiText} onChange={(e) => setTriiText(e.target.value)} rows={3} className="w-full mt-2 px-4 py-3 rounded-xl border border-brand-border bg-brand-bg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition" />
                      </div>
                      <button onClick={handleSendTrii} disabled={triiSending} className="px-6 py-3 rounded-xl bg-linear-to-r from-brand-orange to-amber-600 text-white font-semibold shadow-lg shadow-brand-orange/20 hover:shadow-brand-orange/40 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                        {triiSending ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Enviando…
                          </span>
                        ) : "Enviar Trii"}
                      </button>
                      {triiResult && (
                        <div className="p-3 rounded-xl bg-brand-bg border border-brand-border text-sm text-brand-text">
                          {triiResult}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ CONVERSACIONES ═══ */}
          {activeTab === "conversaciones" && <ConversationsSection />}

          {/* ═══ EVENTOS ═══ */}
          {activeTab === "eventos" && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex gap-3">
                <button onClick={handleClearEvents} className="px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold hover:bg-red-100 active:scale-95 transition-all border border-red-200">
                  🗑 Limpiar eventos
                </button>
                <button onClick={handleExportCSV} className="px-4 py-2.5 rounded-xl bg-white text-brand-muted text-sm font-semibold hover:bg-brand-bg active:scale-95 transition-all border border-brand-border">
                  📊 Exportar CSV
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-brand-border shadow-sm p-6">
                <h3 className="font-bold text-brand-green-dark mb-5">Todos los eventos</h3>
                {safeEvents.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-4xl mb-3">📦</p>
                    <p className="text-sm text-brand-muted">No hay eventos aún.</p>
                  </div>
                )}
                <div className="space-y-2">
                {safeEvents.slice(0, 30).map((e) => (
                  <div key={e.id} className="flex items-center gap-4 p-4 rounded-xl bg-brand-bg hover:bg-brand-border/40 transition-colors">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      e.paymentStatus === "cobrado" ? "bg-green-500" :
                      e.paymentStatus === "pendiente_cobro" ? "bg-yellow-500" :
                      e.paymentStatus === "cancelado" ? "bg-orange-500" :
                      "bg-gray-300"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{labelKind(e.economicKind)} · {safeStr(e.category)} · {safeStr(e.workerName)}</p>
                        <p className="text-xs text-brand-muted">{fmtDate(e.createdAt)} · {safeStr(e.location)} · {labelPayment(e.paymentStatus)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-brand-green-dark tabular-nums">{fmtCurrency(e.amount)}</p>
                      <div className="flex gap-1.5 mt-1.5 justify-end">
                        {e.paymentStatus === "pendiente_cobro" && (
                          <button onClick={() => handleMarkCollected(e.id)} className="px-3 py-1.5 rounded-lg bg-green-50 text-xs text-green-700 font-medium border border-green-200 hover:bg-green-100 active:scale-95 transition-all">
                            ✓ Cobrar
                          </button>
                        )}
                        <button onClick={() => handleDeleteEvent(e.id)} className="px-3 py-1.5 rounded-lg bg-red-50 text-xs text-red-500 font-medium border border-red-200 hover:bg-red-100 active:scale-95 transition-all">
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
                <p className="text-xs text-brand-muted mt-4 text-center">Mostrando {Math.min(30, safeEvents.length)} de {safeEvents.length}</p>
              </div>
            </div>
          )}

          {/* ═══ APRENDIZAJES ═══ */}
          {activeTab === "aprendizajes" && (
            <div className="space-y-6 animate-fade-up">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-brand-green-dark flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-brand-orange/10 flex items-center justify-center text-base">💡</span>
                  Sugerencias del sistema
                </h3>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200">
                  {(state.suggestions || []).filter((s) => s.status === "pending").length} pendientes
                </span>
              </div>
              {(state.suggestions || []).filter((s) => s.status === "pending").length === 0 && (
                <div className="text-center py-12 bg-white rounded-2xl border border-brand-border shadow-sm">
                  <p className="text-4xl mb-3">✨</p>
                  <p className="text-sm text-brand-muted">No hay sugerencias pendientes.</p>
                </div>
              )}
              {(state.suggestions || []).filter((s) => s.status === "pending").map((s) => (
                <div key={s.id} className="bg-white rounded-2xl border border-brand-border shadow-sm p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-sm text-brand-green-dark mt-1">{s.summary || s.source || "Sugerencia"}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        s.severity === "high" ? "bg-red-50 text-red-700 border border-red-200" :
                        s.severity === "warning" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                        "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>{s.severity || "info"}</span>
                      <button onClick={() => { setEditingSugId(editingSugId === s.id ? null : s.id); }} className="w-8 h-8 rounded-lg border border-brand-border bg-brand-bg text-brand-muted hover:bg-brand-border active:scale-95 transition-all flex items-center justify-center text-sm">
                        ✏️
                      </button>
                    </div>
                  </div>
                  {s.businessContextAddition && (
                    <div className="p-4 rounded-xl bg-brand-bg text-sm border border-brand-border/40 text-brand-text leading-relaxed">{s.businessContextAddition}</div>
                  )}
                  {s.interpretationRuleAddition && (
                    <div className="p-4 rounded-xl bg-brand-bg text-sm border border-brand-border/40 text-brand-text leading-relaxed">{s.interpretationRuleAddition}</div>
                  )}
                  {editingSugId === s.id && (
                    <div className="p-4 rounded-xl bg-brand-bg border border-brand-border/40 space-y-3">
                      <div className="flex gap-1.5 p-1 bg-white rounded-lg w-fit">
                        <button onClick={() => setSugField("business")} className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-all ${sugField === "business" ? "bg-brand-green text-white shadow-sm" : "text-brand-muted hover:text-brand-text"}`}>Contexto</button>
                        <button onClick={() => setSugField("rules")} className={`px-3 py-1.5 rounded-md font-semibold text-xs transition-all ${sugField === "rules" ? "bg-brand-green text-white shadow-sm" : "text-brand-muted hover:text-brand-text"}`}>Reglas</button>
                      </div>
                      <textarea value={sugDraft} onChange={(e) => setSugDraft(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border border-brand-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green transition" placeholder="Escribe tu apunte manual (opcional). Se guardará junto con la sugerencia." />
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => handleApproveSug(s.id)} className="flex-1 px-5 py-2.5 rounded-xl bg-brand-green text-white font-semibold text-sm hover:bg-brand-green/90 active:scale-[0.98] shadow-sm shadow-brand-green/25 transition-all">
                      ✓ Aprobar y aplicar
                    </button>
                    <button onClick={() => handleRejectSug(s.id)} className="px-5 py-2.5 rounded-xl bg-white text-brand-muted text-sm font-semibold border border-brand-border hover:bg-brand-bg active:scale-95 transition-all">
                      ✕ Rechazar
                    </button>
                  </div>
                </div>
              ))}
              {(state.suggestions || []).filter((s) => s.status !== "pending").length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-brand-muted uppercase tracking-wider pt-4 border-t border-brand-border/40">Sugerencias ya procesadas</h3>
                  {(state.suggestions || []).filter((s) => s.status !== "pending").map((s) => (
                    <div key={s.id} className="bg-white/60 rounded-xl border border-brand-border/40 p-4 opacity-60">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${s.status === "rejected" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                          {s.status === "approved" ? "✅ Aprobada" : "❌ Rechazada"}
                        </span>
                        <p className="text-sm flex-1 truncate text-brand-text">{s.summary || s.source || "—"}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ═══ SISTEMA ═══ */}
          {activeTab === "sistema" && (
            <div className="space-y-6 animate-fade-up">
              <div className="grid md:grid-cols-2 gap-5">
                {[
                  { name: "Almacenamiento", status: true, detail: state.remote?.enabled ? "Base remota demo" : "Archivo local", icon: "💾" },
                ].map((sys) => (
                  <div key={sys.name} className={`p-6 rounded-2xl bg-white border shadow-sm ${sys.status ? "border-green-200" : "border-brand-border"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-brand-bg flex items-center justify-center text-lg">{sys.icon}</span>
                        <span className="font-bold text-sm text-brand-green-dark">{sys.name}</span>
                      </div>
                      {sys.status
                        ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Activo</span>
                        : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Inactivo</span>
                      }
                    </div>
                    <p className="text-xs text-brand-muted ml-[52px]">{sys.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Conversations Section ──
function ConversationsSection() {
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/interactions").then((r) => r.json()).then(setInteractions).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center gap-3 py-12 justify-center">
      <span className="w-5 h-5 border-2 border-brand-green/30 border-t-brand-green rounded-full animate-spin" />
      <span className="text-sm text-brand-muted">Cargando conversaciones…</span>
    </div>
  );
  if (interactions.length === 0) return (
    <div className="text-center py-14">
      <p className="text-4xl mb-3">💬</p>
      <p className="text-sm text-brand-muted">No hay conversaciones registradas aún.</p>
      <p className="text-xs text-brand-muted/60 mt-1">Usá la sección "Probar agente" para generar datos.</p>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-up">
      {interactions.slice(0, 20).map((ix: any, i: number) => (
        <div key={i} className="bg-white rounded-2xl border border-brand-border shadow-sm p-6 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-brand-text leading-relaxed">{ix.user_message || ix.message || "—"}</p>
              <p className="text-xs text-brand-muted mt-2"><span className="font-semibold text-brand-green-dark">{ix.worker_name || "—"}</span> · {fmtDate(ix.created_at)}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-bg text-brand-muted text-xs font-medium ml-3 flex-shrink-0">🤖 {ix.llm_model || ix.source || "—"}</span>
          </div>
          {ix.llm_reply && (
            <div className="mt-3 p-4 rounded-xl bg-brand-bg border border-brand-border/40">
              <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2">Respuesta</p>
              <p className="text-sm text-brand-text leading-relaxed">{ix.llm_reply}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


