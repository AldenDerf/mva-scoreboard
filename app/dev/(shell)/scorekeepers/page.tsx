import { EmptyPreview, PageHeading } from "@/components/preview-page";

export default function ScorekeepersPreview() {
  return <><PageHeading eyebrow="PEOPLE & PERMISSIONS" title="Scorekeepers" description="Assignments and scoreboard-specific grants will be managed here by authorized admins." /><EmptyPreview title="Assignments are not connected" description="This preview does not list users or grant access. Permission management will require verified sign-in and server-side authorization." /></>;
}
