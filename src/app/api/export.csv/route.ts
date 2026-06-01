import { NextResponse } from "next/server";
import { getAllEvents } from "@/lib/db";
import { getRemoteEvents, isRemoteWoforyEnabled } from "@/lib/remote-wofory";

export async function GET() {
  const events = isRemoteWoforyEnabled() ? await getRemoteEvents().catch(() => getAllEvents()) : getAllEvents();
  const headers = [
    "Fecha", "Nombre", "Telefono", "Tipo", "Categoria", "Monto", "Moneda",
    "EstadoPago", "EstadoEjecucion", "Lugar", "Descripcion", "OrigenCanal",
  ];
  const rows = events.map((e) => [
    e.createdAt, e.workerName, e.workerPhone, e.economicKind, e.category,
    e.amount, e.currency, e.paymentStatus, e.executionStatus, e.location,
    e.description, e.originChannel,
  ]);
  const csv = [headers.join(","), ...rows.map((r) =>
    r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")
  )].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="eventos-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
