import { LiveOverlay } from "@/components/live-overlay";

export const instant = false;
export default async function OverlayPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <LiveOverlay publicId={publicId} />;
}
