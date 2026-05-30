import { NextResponse } from "next/server";
import { updateSuggestionStatus } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suggestion = updateSuggestionStatus(id, "rejected");
  if (!suggestion) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true, suggestion });
}
