import {
  catalogMethodNotAllowed,
  handleScoreboardValidateMatchup,
} from "@/lib/server/catalog-api";

export async function POST(request: Request) {
  return handleScoreboardValidateMatchup(request);
}

export async function GET() {
  return catalogMethodNotAllowed("POST");
}

export async function PUT() {
  return catalogMethodNotAllowed("POST");
}

export async function PATCH() {
  return catalogMethodNotAllowed("POST");
}

export async function DELETE() {
  return catalogMethodNotAllowed("POST");
}
