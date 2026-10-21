import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Character } from "./types";

export type SaveState = "idle" | "saving" | "saved" | "error";
export type Update = (mutate: (draft: Character) => void) => void;

/**
 * Loads a character and keeps a local working copy that autosaves (debounced)
 * after every edit, so the sheet behaves like paper: just write on it.
 */
export function useCharacter(id: string) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["character", id], queryFn: () => api.getCharacter(id) });
  const [character, setCharacter] = useState<Character | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<Character | null>(null);
  const dirty = useRef(false);
  // Undo history. Rapid edits (typing) within 1s are merged into one step.
  const past = useRef<Character[]>([]);
  const future = useRef<Character[]>([]);
  const lastEditAt = useRef(0);
  const [, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (data && !latest.current) {
      latest.current = data;
      setCharacter(data);
    }
  }, [data]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!latest.current || !dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    try {
      await api.saveCharacter(latest.current);
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["characters"] });
    } catch {
      dirty.current = true;
      setSaveState("error");
    }
  }, [qc]);

  const update: Update = useCallback(
    (mutate) => {
      if (!latest.current) return;
      const next = structuredClone(latest.current);
      mutate(next);
      if (Date.now() - lastEditAt.current > 1000) {
        past.current = [...past.current.slice(-49), latest.current];
        future.current = [];
        setHistoryVersion((v) => v + 1);
      }
      lastEditAt.current = Date.now();
      latest.current = next;
      dirty.current = true;
      setCharacter(next);
      setSaveState("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    },
    [flush],
  );

  const travel = useCallback(
    (from: React.MutableRefObject<Character[]>, to: React.MutableRefObject<Character[]>) => {
      const target = from.current.pop();
      if (!target || !latest.current) return;
      to.current.push(latest.current);
      latest.current = target;
      dirty.current = true;
      lastEditAt.current = 0;
      setCharacter(target);
      setHistoryVersion((v) => v + 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    },
    [flush],
  );
  const undo = useCallback(() => travel(past, future), [travel]);
  const redo = useCallback(() => travel(future, past), [travel]);

  // Save pending edits when leaving the page.
  useEffect(() => () => void flush(), [flush]);

  return {
    character, update, saveState, isLoading, error,
    undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  };
}
