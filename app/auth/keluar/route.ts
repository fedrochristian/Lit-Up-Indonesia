import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/request";
import { serverClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 });
  const supabase = await serverClient();
  await supabase.auth.signOut();
  const target = request.nextUrl.clone();
  target.pathname = "/masuk";
  target.search = "";
  return NextResponse.redirect(target, { status: 303 });
}
