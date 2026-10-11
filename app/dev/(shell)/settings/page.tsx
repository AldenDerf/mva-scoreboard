import { EmptyPreview, PageHeading } from "@/components/preview-page";

export default function SettingsPreview() {
  return <><PageHeading eyebrow="WORKSPACE CONFIGURATION" title="Settings" description="Operational settings will appear only after roles and policy are approved." /><EmptyPreview title="No settings available yet" description="The design is prepared for future configuration. This preview cannot change application or Supabase settings." /></>;
}
