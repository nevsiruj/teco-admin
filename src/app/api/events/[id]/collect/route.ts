import { NextResponse } from "next/server";
import { getAllEvents, insertEvent } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const events = getAllEvents();
  const event = events.find((e) => e.id === id);
  if (!event) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  event.paymentStatus = "cobrado";
  insertEvent(event);
  return NextResponse.json({ ok: true });
}
