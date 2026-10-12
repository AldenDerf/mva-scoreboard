export type Side = "A" | "B";
export type Format = 3 | 5;

export interface PracticeSet {
  number: number;
  teamA: number;
  teamB: number;
  startingServe: Side;
  winner: Side | null;
}

type AwardEvent = {
  id: string;
  type: "AWARD";
  setNumber: number;
  team: Side;
  beforeA: number;
  beforeB: number;
  beforeServe: Side;
};
type UndoEvent = { id: string; type: "UNDO"; targetId: string; setNumber: number };
type ConfirmEvent = { id: string; type: "CONFIRM_SET"; setNumber: number; winner: Side };
export type PracticeEvent = AwardEvent | UndoEvent | ConfirmEvent;

export interface PracticeMatch {
  teamA: string;
  teamB: string;
  bestOf: Format;
  status: "LIVE" | "COMPLETED";
  serving: Side;
  sets: PracticeSet[];
  events: PracticeEvent[];
  revision: number;
}

export type PracticeAction =
  | { id: string; expectedRevision: number; type: "AWARD"; team: Side }
  | { id: string; expectedRevision: number; type: "UNDO" }
  | { id: string; expectedRevision: number; type: "CONFIRM_SET" };

export type PracticeResult =
  | { ok: true; state: PracticeMatch; replayed: boolean }
  | { ok: false; reason: "INVALID" | "CONFLICT" | "LOCKED"; state: PracticeMatch };

const other = (side: Side): Side => (side === "A" ? "B" : "A");

export function createPracticeMatch(teamA: string, teamB: string, bestOf: Format, firstServe: Side): PracticeMatch {
  const a = teamA.trim();
  const b = teamB.trim();
  if (!a || !b || a.toLocaleLowerCase() === b.toLocaleLowerCase() ||
      a.length > 80 || b.length > 80 || (bestOf !== 3 && bestOf !== 5) ||
      (firstServe !== "A" && firstServe !== "B")) {
    throw new Error("Enter two different team names and valid match settings.");
  }
  return {
    teamA: a, teamB: b, bestOf, status: "LIVE", serving: firstServe,
    sets: [{ number: 1, teamA: 0, teamB: 0, startingServe: firstServe, winner: null }],
    events: [], revision: 0,
  };
}

export function setWinner(set: PracticeSet, bestOf: Format): Side | null {
  const target = set.number === bestOf ? 15 : 25;
  if (Math.max(set.teamA, set.teamB) < target || Math.abs(set.teamA - set.teamB) < 2) return null;
  return set.teamA > set.teamB ? "A" : "B";
}

export function applyPracticeAction(state: PracticeMatch, action: PracticeAction): PracticeResult {
  if (!action.id) return { ok: false, reason: "INVALID", state };
  const previous = state.events.find((event) => event.id === action.id);
  if (previous) {
    const sameIntent = previous.type === action.type &&
      (previous.type !== "AWARD" || (action.type === "AWARD" && previous.team === action.team));
    return sameIntent ? { ok: true, state, replayed: true } : { ok: false, reason: "INVALID", state };
  }
  if (action.expectedRevision !== state.revision) return { ok: false, reason: "CONFLICT", state };
  if (state.status === "COMPLETED") return { ok: false, reason: "LOCKED", state };

  const current = state.sets.at(-1);
  if (!current || current.winner) return { ok: false, reason: "INVALID", state };
  const pending = setWinner(current, state.bestOf);

  if (action.type === "AWARD") {
    if (pending || (action.team !== "A" && action.team !== "B")) return { ok: false, reason: "LOCKED", state };
    const event: AwardEvent = {
      id: action.id, type: "AWARD", setNumber: current.number, team: action.team,
      beforeA: current.teamA, beforeB: current.teamB, beforeServe: state.serving,
    };
    const nextSet = {
      ...current,
      teamA: current.teamA + (action.team === "A" ? 1 : 0),
      teamB: current.teamB + (action.team === "B" ? 1 : 0),
    };
    return { ok: true, replayed: false, state: {
      ...state, serving: action.team, revision: state.revision + 1,
      sets: [...state.sets.slice(0, -1), nextSet], events: [...state.events, event],
    } };
  }

  if (action.type === "UNDO") {
    const undone = new Set(state.events.filter((event): event is UndoEvent => event.type === "UNDO").map((event) => event.targetId));
    const last = state.events.findLast((event): event is AwardEvent =>
      event.type === "AWARD" && event.setNumber === current.number && !undone.has(event.id));
    if (!last) return { ok: false, reason: "INVALID", state };
    const nextSet = { ...current, teamA: last.beforeA, teamB: last.beforeB };
    return { ok: true, replayed: false, state: {
      ...state, serving: last.beforeServe, revision: state.revision + 1,
      sets: [...state.sets.slice(0, -1), nextSet],
      events: [...state.events, { id: action.id, type: "UNDO", targetId: last.id, setNumber: current.number }],
    } };
  }

  if (!pending) return { ok: false, reason: "INVALID", state };
  const confirmed = { ...current, winner: pending };
  const sets = [...state.sets.slice(0, -1), confirmed];
  const wins = sets.filter((set) => set.winner === pending).length;
  const completed = wins >= Math.ceil(state.bestOf / 2);
  const nextServe = other(current.startingServe);
  return { ok: true, replayed: false, state: {
    ...state, status: completed ? "COMPLETED" : "LIVE", serving: completed ? state.serving : nextServe,
    sets: completed ? sets : [...sets, { number: current.number + 1, teamA: 0, teamB: 0, startingServe: nextServe, winner: null }],
    events: [...state.events, { id: action.id, type: "CONFIRM_SET", setNumber: current.number, winner: pending }],
    revision: state.revision + 1,
  } };
}
