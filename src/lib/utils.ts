import type { EconomicEvent } from "./db";

export function computeMetrics(events: EconomicEvent[]) {
  const collected = events.filter((e) => e.paymentStatus === "cobrado");
  const pending = events.filter((e) => e.paymentStatus === "pendiente_cobro" || e.executionStatus === "pendiente");
  const services = events.filter((e) => e.economicKind === "servicio");
  const products = events.filter((e) => e.economicKind === "producto");

  const categories: Record<string, number> = {};
  events.forEach((e) => {
    const cat = e.derivedCategory || e.economicKind || "otro";
    categories[cat] = (categories[cat] || 0) + 1;
  });
  const topCategories = Object.entries(categories)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalEvents: events.length,
    pendingEvents: pending.length,
    collectedEvents: collected.length,
    totalCollected: collected.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    serviceEvents: services.length,
    productEvents: products.length,
    topCategories,
  };
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " +
      d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value;
}

export function labelKind(kind: string | null): string {
  if (kind === "servicio") return "Servicio";
  if (kind === "producto") return "Producto";
  return "—";
}

export function labelPayment(status: string | null): string {
  if (status === "cobrado") return "Cobrado";
  if (status === "pendiente_cobro") return "Te deben";
  return "—";
}

export function labelExecution(status: string | null): string {
  if (status === "realizado") return "Realizado";
  if (status === "pendiente") return "Pendiente";
  return "—";
}

export function escapeHtml(str: string | null): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
