import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { newCharacter, normalizeCharacter } from "../lib/defaults";
import { classSummary } from "../lib/rules";
import type { Character } from "../lib/types";
import { Modal, Spinner } from "../components/ui";
import { planResync } from "../lib/resync";
import { CORE_BOOKS } from "../components/BookPicker";

export default function CharacterList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["characters"], queryFn: api.listCharacters });

  const create = useMutation({
    mutationFn: (c: Character) => api.createCharacter(c),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["characters"] });
      navigate(`/characters/${c.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: api.deleteCharacter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters"] }),
  });

  const duplicate = async (id: string) => {
    const { id: _id, updatedAt: _u, ...c } = await api.getCharacter(id);
    create.mutate({ ...c, name: `${c.name} (copy)` });
  };

  // Resync every character with the current rules data, one at a time, and report what changed.
  const [resync, setResync] = useState<{ done: number; total: number; results: { name: string; changes: string[]; error?: string }[] } | null>(null);
  const resyncAll = async () => {
    if (!data?.length || !confirm(`Resync all ${data.length} characters with the current rules? Choices, spells, items and notes are kept.`)) return;
    const results: { name: string; changes: string[]; error?: string }[] = [];
    setResync({ done: 0, total: data.length, results });
    for (const [i, s] of data.entries()) {
      try {
        const c = await api.getCharacter(s.id);
        const plan = await planResync(c);
        const next = structuredClone(c);
        plan.apply(next);
        await api.saveCharacter(next);
        results.push({ name: c.name, changes: plan.changes });
      } catch (e) {
        results.push({ name: s.name, changes: [], error: (e as Error).message });
      }
      setResync({ done: i + 1, total: data.length, results: [...results] });
    }
    qc.invalidateQueries({ queryKey: ["characters"] });
    qc.removeQueries({ queryKey: ["character"] });
  };

  const importFile = async (file: File) => {
    try {
      const { id: _id, updatedAt: _u, ...raw } = JSON.parse(await file.text());
      create.mutate(normalizeCharacter(raw));
    } catch {
      alert("That file isn't a valid character export.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink-200">Your Characters</h1>
          <p className="text-sm text-ink-400">Create a character at level 1 or any higher level. The wizard walks you through every choice.</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInput} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          {!!data?.length && (
            <button className="btn" onClick={resyncAll} disabled={!!resync && resync.done < resync.total} title="Re-read every character's features and class tables from the current rules data">
              ⟳ Resync all
            </button>
          )}
          <button className="btn" onClick={() => fileInput.current?.click()}>Import JSON</button>
          <button className="btn" onClick={() => create.mutate({ ...newCharacter(), options: { books: CORE_BOOKS } })} disabled={create.isPending} title="Blank sheet: fill everything in yourself">Blank sheet</button>
          <button className="btn-primary" onClick={() => navigate("/new")}>+ Create character</button>
        </div>
      </div>

      {resync && (
        <Modal
          title={resync.done < resync.total ? `Resyncing… ${resync.done}/${resync.total}` : "Resync complete"}
          onClose={() => resync.done >= resync.total && setResync(null)}
          footer={<button className="btn-primary" disabled={resync.done < resync.total} onClick={() => setResync(null)}>Done</button>}
        >
          <div className="space-y-3 text-sm">
            {resync.results.map((r, i) => (
              <div key={i}>
                <p className="font-display text-ink-200">{r.name}</p>
                {r.error ? (
                  <p className="text-blood-500">Failed: {r.error}</p>
                ) : r.changes.length ? (
                  <ul className="list-disc pl-5 text-ink-400">{r.changes.map((ch, j) => <li key={j}>{ch}</li>)}</ul>
                ) : (
                  <p className="text-ink-600">Already up to date.</p>
                )}
              </div>
            ))}
          </div>
        </Modal>
      )}
      {isLoading && <Spinner />}
      {error && <p className="text-blood-500">Couldn't reach the server: {(error as Error).message}</p>}
      {data?.length === 0 && (
        <div className="panel py-16 text-center">
          <p className="font-display text-xl">No characters yet</p>
          <p className="mt-1 text-sm text-ink-400">Every legend starts with a blank sheet.</p>
          <button className="btn-primary mt-4" onClick={() => navigate("/new")}>Create your first character</button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((c) => {
          const level = c.classes?.reduce((s, k) => s + k.level, 0) ?? 0;
          return (
            <div key={c.id} className="panel group relative flex gap-4 transition hover:border-ink-600">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-800 font-display text-2xl text-accent-400">
                {c.portraitUrl ? <img src={c.portraitUrl} alt="" className="h-full w-full object-cover object-top" /> : c.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <Link to={`/characters/${c.id}`} className="after:absolute after:inset-0">
                  <h2 className="truncate font-display text-lg text-ink-200">{c.name}</h2>
                </Link>
                <p className="truncate text-sm text-ink-400">{[c.race, classSummary(c.classes)].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-xs text-ink-600">Level {level} · edited {new Date(c.updated_at).toLocaleDateString()}</p>
              </div>
              <div className="relative z-10 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => duplicate(c.id)}>Duplicate</button>
                <button
                  className="btn-ghost px-2 py-1 text-xs hover:text-blood-500"
                  onClick={() => confirm(`Delete ${c.name}? This cannot be undone.`) && remove.mutate(c.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
