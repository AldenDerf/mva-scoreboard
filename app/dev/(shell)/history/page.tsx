import { EmptyPreview, PageHeading } from "@/components/preview-page";

export default function HistoryPreview() {
  return <><PageHeading eyebrow="MATCH RECORDS" title="Match History" description="Completed matches and their audited scoring history will live here." /><EmptyPreview title="History is not connected" description="No completed matches are displayed in this preview. Recorded results will require the approved scoreboard database and server access." /></>;
}
