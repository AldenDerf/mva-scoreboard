import { MatchSetupPreview } from "@/components/match-setup-preview";
import { PageHeading } from "@/components/preview-page";

export default function NewMatchPreview() {
  return <><PageHeading eyebrow="MATCH SETUP" title="New Match" description="Walk through the planned selection flow using fictional development data. No tournament records are fetched and no match is created." /><MatchSetupPreview /></>;
}
