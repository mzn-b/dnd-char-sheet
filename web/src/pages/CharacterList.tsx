import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { newCharacter, normalizeCharacter } from "../lib/defaults";
import { classSummary } from "../lib/rules";
import type { Character } from "../lib/types";
import { Spinner } from "../components/ui";

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
          <button className="btn" onClick={() => fileInput.current?.click()}>Import JSON</button>
          <button className="btn" onClick={() => create.mutate(newCharacter())} disabled={create.isPending} title="Blank sheet: fill everything in yourself">Blank sheet</button>
          <button className="btn-primary" onClick={() => navigate("/new")}>+ Create character</button>
        </div>
      </div>

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
                {c.portraitUrl ? <img src={c.portraitUrl} alt="" className="h-full w-full object-cover" /> : c.name.charAt(0)}
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
