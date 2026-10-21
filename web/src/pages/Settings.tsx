import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Providers } from "../lib/api";
import { Section, Spinner, Toggle } from "../components/ui";

const FOLDERS = ["", "class", "subclass", "race", "background", "feat", "spell", "item", "optionalfeature", "collection"];

/** Choose rules-content providers and manage 5etools homebrew files. */
export default function Settings() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const status = useQuery({ queryKey: ["5etools-status"], queryFn: api.fivetoolsStatus, enabled: !!providers.data?.["5etools"], retry: false });
  const brews = useQuery({ queryKey: ["brews"], queryFn: api.brews });
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [library, setLibrary] = useState("");
  const catalog = useQuery({
    queryKey: ["brewCatalog", q, folder, library],
    queryFn: () => api.brewCatalog(q, folder || undefined, library || undefined),
    enabled: q.length >= 2 || !!folder || library === "ua",
  });
  const [adding, setAdding] = useState(false);
  const addAll = async (paths: string[]) => {
    setAdding(true);
    for (const path of paths) await api.addBrew(path).catch(() => {});
    setAdding(false);
    refreshContent();
  };

  const refreshContent = () => {
    for (const k of ["content", "detail", "classRules", "subclassRules", "5etools-status", "brews"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const setP = useMutation({
    mutationFn: (p: Partial<Providers>) => api.setProviders(p),
    onSuccess: (p) => { qc.setQueryData(["providers"], p); refreshContent(); },
  });
  const add = useMutation({ mutationFn: api.addBrew, onSuccess: refreshContent });
  const remove = useMutation({ mutationFn: api.removeBrew, onSuccess: refreshContent });
  const enabled = new Set(brews.data?.map((b) => b.path));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Content sources</h1>
        <p className="text-sm text-ink-400">Choose where spells, classes, feats and other rules content come from. Your own homebrew is always included.</p>
      </div>

      <Section title="Providers">
        {providers.isLoading && <Spinner />}
        {providers.data && (
          <div className="space-y-4">
            <Provider
              on={providers.data.srd}
              onChange={(v) => setP.mutate({ srd: v })}
              name="5e SRD API"
              desc="The free System Reference Document 5.1 (dnd5eapi.co). Core classes, one subclass each, ~300 spells."
            />
            <Provider
              on={providers.data.open5e}
              onChange={(v) => setP.mutate({ open5e: v })}
              name="Open5e"
              desc="Free OGL expansions from api.open5e.com: Kobold Press (Deep Magic, Tome of Heroes, Vault of Magic, Warlock Archives), Level Up Advanced 5e, Tal'Dorei and more: spells, subclasses, races, backgrounds, feats, magic items, weapons and armor. Choose books below."
            />
            {providers.data.open5e && <Open5eBooks onChange={refreshContent} />}
            <Provider
              on={providers.data["5etools"]}
              onChange={(v) => setP.mutate({ "5etools": v })}
              name="5etools"
              desc={`Every 2014-rules book: all subclasses, races, feats, spells, items and optional class features. Loaded from ${providers.data.fivetoolsDataUrl}. Entries duplicated from the SRD are shown once, using the full 5etools text.`}
            />
            <p className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-xs text-ink-400">
              5etools mirrors content beyond the SRD. Use it for books you own; the data is fetched from the mirror you configure (set <code>FIVETOOLS_DATA_URL</code> to self-host it).
            </p>
            {providers.data["5etools"] && (
              <div className="text-sm">
                {status.isLoading && <Spinner label="Loading 5etools data (first time can take a few seconds)…" />}
                {status.error && <p className="text-blood-500">Couldn't load 5etools data: {(status.error as Error).message}</p>}
                {status.data && (
                  <p className="text-emerald-400">
                    Loaded {String(status.data.spells)} spells, {String(status.data.classes)} classes, {String(status.data.subclasses)} subclasses, {String(status.data.races)} races, {String(status.data.feats)} feats, {String(status.data.items)} items.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="5etools homebrew & Unearthed Arcana library">
        <p className="mb-3 text-sm text-ink-400">
          Add community content from the 5etools homebrew repository: classes, subclasses, races, spells and more. Enabled files appear in every picker
          {providers.data && !providers.data["5etools"] && <b className="text-accent-400"> once the 5etools provider is turned on</b>}.
        </p>
        {brews.data && brews.data.length > 0 && (
          <ul className="mb-4 space-y-1">
            {brews.data.map((b) => (
              <li key={b.path} className="flex items-center justify-between gap-2 rounded-lg bg-ink-850 px-3 py-1.5 text-sm">
                <span>
                  <span className={`chip mr-2 ${b.path.startsWith("ua:") ? "border-sky-800 text-sky-300" : ""}`}>{b.path.startsWith("ua:") ? "UA" : b.path.split("/")[0]}</span>
                  {b.path.split("/")[1].replace(/\.json$/, "")}
                </span>
                <button className="btn-ghost px-2 py-0.5 text-xs hover:text-blood-500" onClick={() => remove.mutate(b.path)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <select className="field-boxed w-auto" value={library} onChange={(e) => setLibrary(e.target.value)}>
            <option value="">All libraries</option>
            <option value="ua">Unearthed Arcana (playtest)</option>
            <option value="homebrew">Community homebrew</option>
          </select>
          <input className="field-boxed flex-1" placeholder="Search (e.g. 'Blood Hunter', 'Artificer')…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field-boxed w-auto" value={folder} onChange={(e) => setFolder(e.target.value)}>
            {FOLDERS.map((f) => <option key={f} value={f}>{f || "All types"}</option>)}
          </select>
        </div>
        <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-ink-800">
          {catalog.isLoading && <div className="p-3"><Spinner /></div>}
          {!catalog.data && !catalog.isLoading && <p className="p-3 text-sm text-ink-600">Type at least two letters to search, or pick the Unearthed Arcana library to see all playtest files.</p>}
          {catalog.data?.length === 0 && <p className="p-3 text-sm text-ink-600">No files found.</p>}
          {catalog.data?.map((b) => (
            <div key={b.path} className="flex items-center gap-2 border-b border-ink-800 px-3 py-1.5 text-sm last:border-0">
              <span className={`chip ${b.library === "ua" ? "border-sky-800 text-sky-300" : ""}`}>{b.library === "ua" ? "UA" : b.folder}</span>
              <span className="flex-1 truncate">{b.name}</span>
              {/20(2[4-9])/.test(b.name) && <span className="chip border-accent-600 text-accent-400" title="Written for the 2024 rules">2024 rules</span>}
              {enabled.has(b.path) ? (
                <span className="text-xs text-emerald-400">Added</span>
              ) : (
                <button className="btn px-2 py-0.5 text-xs" disabled={add.isPending} onClick={() => add.mutate(b.path)}>Add</button>
              )}
            </div>
          ))}
        </div>
        {catalog.data && catalog.data.some((b) => !enabled.has(b.path)) && (
          <div className="mt-2 flex justify-end">
            <button
              className="btn text-xs"
              disabled={adding}
              title="Adds every file in the list above (skipping 2024-rules playtests)"
              onClick={() => addAll(catalog.data!.filter((b) => !enabled.has(b.path) && !/20(2[4-9])/.test(b.name)).map((b) => b.path))}
            >
              {adding ? "Adding…" : `Add all shown (${catalog.data.filter((b) => !enabled.has(b.path) && !/20(2[4-9])/.test(b.name)).length})`}
            </button>
          </div>
        )}
        {add.error && <p className="mt-2 text-sm text-blood-500">{(add.error as Error).message}</p>}
      </Section>
    </div>
  );
}

function Provider({ on, onChange, name, desc }: { on: boolean; onChange: (v: boolean) => void; name: string; desc: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-semibold">{name}</div>
        <div className="text-sm text-ink-400">{desc}</div>
      </div>
      <Toggle checked={on} onChange={onChange} label="" />
    </div>
  );
}

/** Toggle individual Open5e books (documents). */
function Open5eBooks({ onChange }: { onChange: () => void }) {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: ["open5eDocs"], queryFn: api.open5eDocuments });
  const save = useMutation({
    mutationFn: api.setOpen5eExcluded,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["open5eDocs"] }); onChange(); },
  });
  if (!docs.data) return <Spinner label="Loading Open5e books…" />;
  const toggle = (slug: string, on: boolean) =>
    save.mutate(docs.data!.filter((d) => (d.slug === slug ? !on : !d.enabled)).map((d) => d.slug));
  return (
    <div className="ml-4 grid gap-1 rounded-lg border border-ink-800 p-3 text-sm sm:grid-cols-2">
      {docs.data.map((d) => (
        <label key={d.slug} className="flex items-center gap-2">
          <input type="checkbox" className="accent-accent-500" checked={d.enabled} onChange={(e) => toggle(d.slug, e.target.checked)} />
          <span className="truncate">{d.title}</span>
          <span className="truncate text-xs text-ink-600">{d.organization}</span>
        </label>
      ))}
      <p className="col-span-full mt-1 text-xs text-ink-600">"5e Core Rules" is the SRD again; it's off by default because the SRD provider already covers it. Monster books add nothing to character options.</p>
    </div>
  );
}
