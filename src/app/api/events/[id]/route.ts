import { NextResponse } from "next/server";
import { deleteEventById } from "@/lib/db";
import { isRemoteWoforyEnabled } from "@/lib/remote-wofory";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isRemoteWoforyEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Acción bloqueada por seguridad: no se eliminan eventos remotos desde este panel." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const deleted = deleteEventById(id);
  return NextResponse.json({ ok: deleted });
}
