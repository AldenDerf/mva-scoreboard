import type { Metadata } from "next";
import { PracticeScorekeeper } from "@/components/practice-scorekeeper";

export const metadata: Metadata = { title: "Practice scoring · Development only | MVA Live Scoreboard", robots: { index: false, follow: false } };

export default function PracticePage() { return <PracticeScorekeeper />; }
