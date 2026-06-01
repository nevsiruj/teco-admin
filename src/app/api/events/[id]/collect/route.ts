import { NextResponse } from "next/server";
import { getAllEvents, insertEvent } from "@/lib/db";
import { isRemoteWoforyEnabled } from "@/lib/remote-wofory";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isRemoteWoforyEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Acción bloqueada por seguridad: no se modifica el estado de cobro remoto desde este panel." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const events = getAllEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  event.paymentStatus = "cobrado";
  insertEvent(event);
  return NextResponse.json({ ok: true });
}
