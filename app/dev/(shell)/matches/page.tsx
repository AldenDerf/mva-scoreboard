import { EmptyPreview, PageHeading } from "@/components/preview-page";

export default function MatchesPreview() {
  return <><PageHeading eyebrow="MATCH OPERATIONS" title="Matches" description="Upcoming and active matches will be managed here after the server is connected." /><EmptyPreview title="No matches connected" description="This development view has no live data. Explore the match setup preview to review the planned flow." href="/dev/matches/new" linkLabel="Preview new match" /></>;
}
