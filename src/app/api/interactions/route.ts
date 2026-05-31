import { NextResponse } from "next/server";
import { getAllEvents, getInteractions } from "@/lib/db";

export async function GET() {
  const interactions = getInteractions();
  if (interactions.length > 0) return NextResponse.json(interactions);

  // TECO Admin is independent from demo.wofory.com. If there are no explicit
  // interaction rows yet, derive the conversation view from local events only.
  const derivedFromLocalEvents = getAllEvents().map((event) => ({
    id: event.id,
    worker_name: event.workerName,
    worker_phone: event.workerPhone,
    user_message: event.sourceMessage || event.description || event.economicLabel,
    llm_reply: buildLocalReply(event),
    llm_model: event.source || "local",
    source: event.originChannel || "local",
    created_at: event.createdAt,
  }));

  return NextResponse.json(derivedFromLocalEvents);
}

function buildLocalReply(event: ReturnType<typeof getAllEvents>[number]) {
  const kind = event.economicKind || event.category || "evento";
  const amount = event.amount != null ? ` por $ ${Number(event.amount).toLocaleString("es-AR")}` : "";
  const payment = event.paymentStatus ? `, estado ${event.paymentStatus.replace("_", " ")}` : "";
  const place = event.location ? ` en ${event.location}` : "";
  return `Registro local: ${kind}${amount}${place}${payment}.`;
}
