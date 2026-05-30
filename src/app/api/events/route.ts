import { NextResponse } from "next/server";
import { getAllEvents, deleteAllEvents, type EconomicEvent } from "@/lib/db";
import { computeMetrics } from "@/lib/utils";

export async function GET() {
  const events = getAllEvents();
  const metrics = computeMetrics(events);
  return NextResponse.json({ events, metrics });
}

export async function DELETE() {
  deleteAllEvents();
  return NextResponse.json({ ok: true, events: [], metrics: computeMetrics([]) });
}
