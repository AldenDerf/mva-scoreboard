import {
  catalogMethodNotAllowed,
  handleScoreboardCatalogTeams,
} from "@/lib/server/catalog-api";

export async function GET(request: Request) {
  return handleScoreboardCatalogTeams(request);
}

export async function POST() {
  return catalogMethodNotAllowed("GET");
}

export async function PUT() {
  return catalogMethodNotAllowed("GET");
}

export async function PATCH() {
  return catalogMethodNotAllowed("GET");
}

export async function DELETE() {
  return catalogMethodNotAllowed("GET");
}
