import type { Metadata } from "next";
import { OverlayPreview } from "@/components/overlay-preview";

export const metadata: Metadata = { title: "Overlay visual preview · Not live | MVA Live Scoreboard", robots: { index: false, follow: false } };

export default function OverlayPreviewPage() {
  return <OverlayPreview />;
}
