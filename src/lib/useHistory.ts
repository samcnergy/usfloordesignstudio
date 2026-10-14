"use client";

// Undo/redo for the design. Normal edits go through `apply`, which records a
// step. Drags call `begin` once, `preview` on every move, and `commit` at the
// end, so a whole drag is one undo step.

import { useCallback, useReducer } from "react";

const LIMIT = 200;

interface State<T> {
  past: T[];
  present: T;
  future: T[];
  dragStart: T | null;
}

type Action<T> =
  | { type: "apply"; fn: (d: T) => T }
  | { type: "begin" }
  | { type: "preview"; fn: (d: T) => T }
  | { type: "commit" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

function reducer<T>(s: State<T>, a: Action<T>): State<T> {
  switch (a.type) {
    case "apply": {
      const next = a.fn(s.present);
      if (next === s.present) return s;
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [], dragStart: null };
    }
    case "begin":
      return { ...s, dragStart: s.present };
    case "preview": {
      const base = s.dragStart ?? s.present;
      return { ...s, present: a.fn(base) };
    }
    case "commit": {
      if (!s.dragStart || s.dragStart === s.present) return { ...s, dragStart: null };
      return { past: [...s.past, s.dragStart].slice(-LIMIT), present: s.present, future: [], dragStart: null };
    }
    case "undo": {
      if (!s.past.length) return s;
      return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future], dragStart: null };
    }
    case "redo": {
      if (!s.future.length) return s;
      return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1), dragStart: null };
    }
    case "reset":
      return { past: [], present: a.value, future: [], dragStart: null };
  }
}

export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(reducer<T>, { past: [], present: initial, future: [], dragStart: null });
  const apply = useCallback((fn: (d: T) => T) => dispatch({ type: "apply", fn }), []);
  const begin = useCallback(() => dispatch({ type: "begin" }), []);
  const preview = useCallback((fn: (d: T) => T) => dispatch({ type: "preview", fn }), []);
  const commit = useCallback(() => dispatch({ type: "commit" }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    present: state.present,
    apply,
    begin,
    preview,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
