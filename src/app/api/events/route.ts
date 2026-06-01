import { NextResponse } from "next/server";
import { getAllEvents, deleteAllEvents, type EconomicEvent } from "@/lib/db";
import { getRemoteEvents, isRemoteWoforyEnabled } from "@/lib/remote-wofory";
import { computeMetrics } from "@/lib/utils";

export async function GET() {
  if (isRemoteWoforyEnabled()) {
    try {
      const events = await getRemoteEvents();
      return NextResponse.json({ events, metrics: computeMetrics(events) });
    } catch (error) {
      console.error("Remote events fallback:", error);
    }
  }

  const events = getAllEvents();
  const metrics = computeMetrics(events);
  return NextResponse.json({ events, metrics });
}

export async function DELETE() {
  deleteAllEvents();
  return NextResponse.json({ ok: true, events: [], metrics: computeMetrics([]) });
}
