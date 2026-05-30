import { NextResponse } from "next/server";
import { deleteEventById } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = deleteEventById(id);
  return NextResponse.json({ ok: deleted });
}
