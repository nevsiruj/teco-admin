import { NextResponse } from "next/server";
import { getInteractions } from "@/lib/db";

export async function GET() {
  const interactions = getInteractions();
  return NextResponse.json(interactions);
}
