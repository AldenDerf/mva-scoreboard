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
type CorrectionEvent = { id: string; type: "SUBTRACT" | "CORRECT_POINTS" | "CORRECT_SERVE" | "CORRECT_SET" | "CORRECT_CURRENT_SET"; intent: string; setNumber: number; before: { teamA: number; teamB: number; serving: Side; winner: Side | null; currentSet: number }; after: { teamA: number; teamB: number; serving: Side; winner: Side | null; currentSet: number }; reason: string };
export type PracticeEvent = AwardEvent | UndoEvent | ConfirmEvent | CorrectionEvent;

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
  | { id: string; expectedRevision: number; type: "CONFIRM_SET" }
  | { id: string; expectedRevision: number; type: "SUBTRACT"; team: Side }
  | { id: string; expectedRevision: number; type: "CORRECT_POINTS"; teamA: number; teamB: number; reason: string }
  | { id: string; expectedRevision: number; type: "CORRECT_SERVE"; serving: Side; reason: string }
  | { id: string; expectedRevision: number; type: "CORRECT_SET"; setNumber: number; teamA: number; teamB: number; reason: string }
  | { id: string; expectedRevision: number; type: "CORRECT_CURRENT_SET"; setNumber: number; reason: string };

export type PracticeResult =
  | { ok: true; state: PracticeMatch; replayed: boolean }
  | { ok: false; reason: "INVALID" | "CONFLICT" | "LOCKED"; state: PracticeMatch };

const other = (side: Side): Side => (side === "A" ? "B" : "A");
const validPoints = (value: number) => Number.isSafeInteger(value) && value >= 0;
const validReason = (value: string) => value.trim().length > 0 && value.trim().length <= 500;
export function setsWon(state: PracticeMatch, side: Side): number { return state.sets.filter((set) => set.winner === side).length; }
export function startNewPracticeMatch(): null { return null; }

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
export function validFinalSet(set: PracticeSet, bestOf: Format): boolean {
  const winner = setWinner(set, bestOf);
  if (!winner || !validPoints(set.teamA) || !validPoints(set.teamB)) return false;
  const target = set.number === bestOf ? 15 : 25;
  const winning = winner === "A" ? set.teamA : set.teamB;
  const losing = winner === "A" ? set.teamB : set.teamA;
  return losing < target - 1 ? winning === target : winning === losing + 2;
}

export function applyPracticeAction(state: PracticeMatch, action: PracticeAction): PracticeResult {
  if (!action.id) return { ok: false, reason: "INVALID", state };
  const previous = state.events.find((event) => event.id === action.id);
  if (previous) {
    const { id: _id, expectedRevision: _revision, ...intent } = action;
    void _id; void _revision;
    const sameIntent = previous.type === action.type && ("intent" in previous
      ? previous.intent === JSON.stringify(intent)
      : previous.type !== "AWARD" || (action.type === "AWARD" && previous.team === action.team));
    return sameIntent ? { ok: true, state, replayed: true } : { ok: false, reason: "INVALID", state };
  }
  if (action.expectedRevision !== state.revision) return { ok: false, reason: "CONFLICT", state };
  if (state.status === "COMPLETED" && action.type !== "CORRECT_SET") return { ok: false, reason: "LOCKED", state };

  const current = state.sets.at(-1);
  if (!current) return { ok: false, reason: "INVALID", state };
  if (action.type === "SUBTRACT" || action.type === "CORRECT_POINTS" || action.type === "CORRECT_SERVE" || action.type === "CORRECT_SET" || action.type === "CORRECT_CURRENT_SET") {
    const target = action.type === "CORRECT_SET" ? state.sets[action.setNumber - 1] : current;
    if (!target || (action.type !== "CORRECT_SET" && target.winner)) return { ok: false, reason: "INVALID", state };
    if (action.type === "CORRECT_CURRENT_SET") {
      if (!validReason(action.reason) || action.setNumber !== current.number - 1 || current.teamA !== 0 || current.teamB !== 0 || current.number <= 1) return { ok: false, reason: "INVALID", state };
      const prior = state.sets.at(-2)!;
      if (!prior.winner) return { ok: false, reason: "INVALID", state };
      const reopened = { ...prior, winner: null };
      const before = { teamA: current.teamA, teamB: current.teamB, serving: state.serving, winner: current.winner, currentSet: current.number };
      const after = { teamA: reopened.teamA, teamB: reopened.teamB, serving: state.serving, winner: reopened.winner, currentSet: reopened.number };
      const { id: _id, expectedRevision: _revision, ...intent } = action; void _id; void _revision;
      return { ok: true, replayed: false, state: { ...state, sets: [...state.sets.slice(0, -2), reopened], revision: state.revision + 1,
        events: [...state.events, { id: action.id, type: action.type, intent: JSON.stringify(intent), setNumber: prior.number, before, after, reason: action.reason.trim() }] } };
    }
    const before = { teamA: target.teamA, teamB: target.teamB, serving: state.serving, winner: target.winner, currentSet: current.number };
    let changed = target;
    let serving = state.serving;
    if (action.type === "SUBTRACT") {
      if ((action.team !== "A" && action.team !== "B") || (action.team === "A" ? target.teamA : target.teamB) === 0) return { ok: false, reason: "INVALID", state };
      changed = { ...target, teamA: target.teamA - (action.team === "A" ? 1 : 0), teamB: target.teamB - (action.team === "B" ? 1 : 0) };
    } else if (action.type === "CORRECT_POINTS" || action.type === "CORRECT_SET") {
      if (!validPoints(action.teamA) || !validPoints(action.teamB) || !validReason(action.reason)) return { ok: false, reason: "INVALID", state };
      changed = { ...target, teamA: action.teamA, teamB: action.teamB };
      if (action.type === "CORRECT_SET") {
        if (!target.winner || target.number >= current.number && state.status !== "COMPLETED") return { ok: false, reason: "INVALID", state };
        const winner = setWinner(changed, state.bestOf);
        if (!winner || !validFinalSet(changed, state.bestOf)) return { ok: false, reason: "INVALID", state };
        changed = { ...changed, winner };
        const sets = state.sets.map((set) => set.number === target.number ? changed : set);
        const needed = Math.ceil(state.bestOf / 2);
        // A match may end only on its last confirmed set; later history is never erased.
        if (sets.slice(0, -1).some((_, index) =>
          sets.slice(0, index + 1).filter((set) => set.winner === "A").length >= needed ||
          sets.slice(0, index + 1).filter((set) => set.winner === "B").length >= needed)) return { ok: false, reason: "INVALID", state };
        const finalA = sets.filter((set) => set.winner === "A").length;
        const finalB = sets.filter((set) => set.winner === "B").length;
        if (state.status === "COMPLETED" ? Math.max(finalA, finalB) !== needed : Math.max(finalA, finalB) >= needed) return { ok: false, reason: "INVALID", state };
      }
    } else if (action.type === "CORRECT_SERVE") {
      if ((action.serving !== "A" && action.serving !== "B") || !validReason(action.reason)) return { ok: false, reason: "INVALID", state };
      serving = action.serving;
    }
    if (changed.teamA === target.teamA && changed.teamB === target.teamB && changed.winner === target.winner && serving === state.serving) return { ok: false, reason: "INVALID", state };
    const reason = action.type === "SUBTRACT" ? `Subtract one point from Team ${action.team}` : action.reason.trim();
    const after = { teamA: changed.teamA, teamB: changed.teamB, serving, winner: changed.winner, currentSet: current.number };
    return { ok: true, replayed: false, state: { ...state, serving, revision: state.revision + 1,
      sets: state.sets.map((set) => set.number === target.number ? changed : set),
      events: [...state.events, { id: action.id, type: action.type, intent: JSON.stringify((({ id, expectedRevision, ...rest }) => { void id; void expectedRevision; return rest; })(action)), setNumber: target.number, before, after, reason }] } };
  }
  if (current.winner) return { ok: false, reason: "INVALID", state };
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

  if (!pending || !validFinalSet(current, state.bestOf)) return { ok: false, reason: "INVALID", state };
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
