import { NextResponse } from "next/server";
import { updateSuggestionStatus, getOwnerContext, saveOwnerContext } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const suggestion = updateSuggestionStatus(id, "approved");
  if (!suggestion) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const ctx = getOwnerContext();
  if (suggestion.businessContextAddition) {
    ctx.businessContext = (ctx.businessContext + "\n" + suggestion.businessContextAddition).trim();
  }
  if (suggestion.interpretationRuleAddition) {
    ctx.interpretationRules = (ctx.interpretationRules + "\n" + suggestion.interpretationRuleAddition).trim();
  }
  saveOwnerContext(ctx);
  return NextResponse.json({ ok: true, suggestion });
}
