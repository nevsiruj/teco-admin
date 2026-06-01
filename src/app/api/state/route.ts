import { NextResponse } from "next/server";
import { getAllEvents, getAllUsers, getAllSuggestions, getOwnerContext } from "@/lib/db";
import { getRemoteState, isRemoteWoforyEnabled } from "@/lib/remote-wofory";
import { computeMetrics } from "@/lib/utils";

export async function GET() {
  if (isRemoteWoforyEnabled()) {
    try {
      const remoteState = await getRemoteState();
      return NextResponse.json({
        ...remoteState,
        storage: { ...(remoteState.storage as object), mode: "remote-demo" },
        remote: { enabled: true, source: "demo.wofory.com" },
      });
    } catch (error) {
      console.error("Remote state fallback:", error);
    }
  }

  const events = getAllEvents();
  const users = getAllUsers();
  const suggestions = getAllSuggestions();
  const ownerContext = getOwnerContext();
  const metrics = computeMetrics(events);
  return NextResponse.json({
    events,
    users,
    suggestions,
    ownerContext,
    metrics,
    llm: {
      mode: process.env.MIMO_API_KEY ? "live" : "heuristic-fallback",
      provider: process.env.LLM_PROVIDER || "No configurado",
    },
    trii: {
      configured: Boolean(process.env.TRII_TOKEN || process.env.TRII_API_KEY),
      endpoint: process.env.TRII_ENDPOINT || "",
    },
    storage: { mode: "sqlite" },
  });
}
