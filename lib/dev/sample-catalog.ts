// Fictional values for development-only UI review. Never use for an MVA API request.
export const sampleTournaments = [
  {
    id: "sample-coastal",
    name: "Sample Coastal Cup",
    divisions: [
      { id: "sample-open", name: "Open Division", teams: ["North Shore Spikers", "Harbor Volley Club", "Blue Ridge United", "South Point Waves"] },
      { id: "sample-women", name: "Women’s Division", teams: ["Seabreeze Squad", "Hillcrest Vipers", "East Bay Aces", "Sunset Volley"] },
    ],
  },
  {
    id: "sample-island",
    name: "Sample Island Invitational",
    divisions: [
      { id: "sample-mixed", name: "Mixed Division", teams: ["The Lighthouse Collective", "West Harbor Setters", "Skyline Volley", "Coral Coast Crew"] },
    ],
  },
] as const;
