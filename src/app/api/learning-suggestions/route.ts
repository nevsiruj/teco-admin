import { NextResponse } from "next/server";
import { getAllSuggestions } from "@/lib/db";
import { getRemoteSuggestions, isRemoteWoforyEnabled } from "@/lib/remote-wofory";

export async function GET() {
  if (isRemoteWoforyEnabled()) {
    try {
      return NextResponse.json(await getRemoteSuggestions());
    } catch (error) {
      console.error("Remote suggestions fallback:", error);
    }
  }
  return NextResponse.json(getAllSuggestions());
}
