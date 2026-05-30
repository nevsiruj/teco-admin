import { NextResponse } from "next/server";
import { getAllSuggestions } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllSuggestions());
}
