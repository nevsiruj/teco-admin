import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext, saveOwnerContext } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getOwnerContext());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ctx = getOwnerContext();
  if (body.businessContext !== undefined) ctx.businessContext = body.businessContext;
  if (body.interpretationRules !== undefined) ctx.interpretationRules = body.interpretationRules;
  if (body.systemPrompt !== undefined) ctx.systemPrompt = body.systemPrompt;
  if (body.promptTemplate !== undefined) ctx.promptTemplate = body.promptTemplate;
  if (body.welcomeMessage !== undefined) ctx.welcomeMessage = body.welcomeMessage;
  if (body.dataUsageNotice !== undefined) ctx.dataUsageNotice = body.dataUsageNotice;
  saveOwnerContext(ctx);
  return NextResponse.json({ ok: true, context: ctx });
}
