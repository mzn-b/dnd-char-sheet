/**
 * Checks every race, background and feat the API serves: no raw 5etools keys in proficiencies, no
 * unrendered markup, no empty choices or placeholder items, plus spot values from the books.
 *
 *   npx tsx scripts/verify-content.mts      (needs the API on http://localhost:4000 or API_URL)
 */
const API = `${process.env.API_URL ?? "http://localhost:4000"}/api`;
const j = async (p: string) => (await fetch(API + p)).json();
const det = (t: string, src: string, key: string) => j(`/content/${t}/${src}/${encodeURIComponent(key)}`);
const bad: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) bad.push(msg); };
// 1. no raw keys anywhere
for (const t of ["race", "background", "feat"]) {
  const list = await j(`/content/${t}`);
  let n = 0;
  for (const s of list) {
    const d = await det(t, s.source, s.key).catch(() => null);
    if (!d || d.error) { bad.push(`${t} ${s.name}: no detail`); continue; }
    n++;
    for (const e of d.effects ?? []) if (e.kind === "proficiency" && /\bany[A-Z]\w+|\bchoose \d|^Languages: [a-z, ]*\bother\b|^(Tools|Languages): ?$|No additional|N\/A/.test(e.value)) bad.push(`${t} ${s.name}: "${e.value}"`);
    if (/\{@|\[object|undefined/.test(d.description ?? "")) bad.push(`${t} ${s.name}: markup in text`);
    for (const c of d.choices ?? []) if (!c.options?.length) bad.push(`${t} ${s.name}: empty choice ${c.label}`);
    for (const r of d.startingEquipment ?? []) for (const o of r.options) for (const it of o.items) if (/^(setGaming|\?|anyGamingSet)$/.test(it.name) || /^\d+$/.test(it.name)) bad.push(`${t} ${s.name}: item "${it.name}"`);
    // The list must say what the detail applies (DMG monster races have no increases at all).
    const appliesAbilities = (d.effects ?? []).some((e: any) => e.kind === "ability") || (d.choices ?? []).some((c: any) => c.kind === "ability");
    if (t === "race" && appliesAbilities && !s.abilities) bad.push(`race ${s.name} (${s.source}): no ability text`);
  }
  console.log(t, list.length, "checked", n);
}
// 2. spot values
const races5 = (await j("/content/race")).filter((x: any) => x.source === "5etools");
// Look a race up by name and source book ("Elf (Wood)", "PHB").
const r = (k: string) => {
  const [name, src] = k.split("|");
  const hit = races5.find((x: any) => x.name === name && x.key.endsWith(`|${src}`)) ?? races5.find((x: any) => x.name === name);
  if (!hit) throw new Error(`no race ${k}`);
  return det("race", "5etools", hit.key);
};
const eff = (d: any, kind: string) => (d.effects ?? []).filter((e: any) => e.kind === kind);
let d = await r("Elf (Wood)|PHB"); check(eff(d, "speed")[0]?.amount === 35, "Wood Elf speed 35");
d = await r("Elf (Drow)|PHB"); check((d.description.match(/\*\*Darkvision\.\*\*/g) ?? []).length === 0 && /Superior Darkvision/.test(d.description), "Drow: only Superior Darkvision");
d = await r("Dwarf (Mountain)|PHB"); check(eff(d, "proficiency").some((e: any) => /Armor: light armor, medium armor/.test(e.value)), "Mountain Dwarf armor");
d = await r("Centaur|MOT"); check(eff(d, "ability").length === 2 && eff(d, "speed")[0]?.amount === 40, "Centaur MOT");
d = await r("Elf (High)|PHB"); check((d.spellPicks ?? []).length === 1, "High Elf cantrip pick");
d = await r("Astral Elf|AAG"); check((d.spellVariants ?? []).length === 3, "Astral Elf variants");
d = await r("Human (Variant)|PHB"); check(d.featChoice?.count === 1 && !d.featChoice.options, "Variant Human any feat");
d = await r("Aarakocra|EEPC"); check(/fly 50/.test(d.meta.Speed ?? ""), `Aarakocra fly: ${d.meta.Speed}`);
d = await r("Leonin|MOT"); check(eff(d, "proficiency").some((e: any) => e.value === "Languages: common, Leonin" || /Leonin/.test(e.value)), `Leonin language ${JSON.stringify(eff(d, "proficiency"))}`);
d = await r("Tabaxi|VGM"); check((d.choices ?? []).some((c: any) => c.kind === "proficiency" && c.prefix === "Languages"), "Tabaxi language choice");
d = await r("Tiefling (Variant; Winged)|SCAG"); check(!(d.grantedSpells ?? []).length, "Winged tiefling no spells");
const b = (k: string) => det("background", "5etools", k);
d = await b("Noble|PHB"); check(d.startingEquipment.some((r: any) => r.options.some((o: any) => o.items.some((i: any) => i.name === "25 gp"))), "Noble 25 gp");
d = await b("Soldier|PHB"); check(d.choices.some((c: any) => c.prefix === "Tools" && c.options.some((o: any) => o.name === "Dice set")), "Soldier gaming set choice");
d = await b("House Agent|ERLW"); check(d.choices.some((c: any) => c.id === "tools-set" && c.options.length >= 12), "House Agent sets");
d = await b("Azorius Functionary|GGR"); check(d.suggestions.traits.length === 8, `Azorius traits ${d.suggestions.traits.length}`);
d = await b("Far Traveler|SCAG"); check(!JSON.stringify(d.startingEquipment).includes("setGaming"), "Far Traveler gaming set");
d = await b("Lorehold Student|SCC"); check(d.featChoice?.options?.[0]?.name === "Strixhaven Initiate", "Lorehold feat");
d = await b("Variant Noble (Knight)|PHB"); check(/Retainers/.test(d.description), "Knight retainers");
const f = (k: string) => det("feat", "5etools", k);
d = await f("Magic Initiate|PHB"); check((d.spellVariants ?? []).length >= 6 && d.spellVariants[0].spellPicks.length === 2, "Magic Initiate variants+picks");
d = await f("Resilient|PHB"); check(d.choices.some((c: any) => c.grantsSave) && !d.choices.some((c: any) => c.kind === "save"), "Resilient tied save");
d = await f("Weapon Master|PHB"); check(d.choices.some((c: any) => c.prefix === "Weapons" && c.count === 4), "Weapon Master 4 weapons");
d = await f("Skilled|PHB"); check(d.choices.some((c: any) => c.count === 3 && c.prefix === "mixed"), "Skilled 3");
d = await f("Martial Adept|PHB"); check(d.choices.some((c: any) => c.count === 2 && /Maneuvers/.test(c.label)), "Martial Adept maneuvers");
d = await f("Linguist|PHB"); check(d.choices.some((c: any) => c.prefix === "Languages" && c.count === 3), "Linguist 3 languages");
d = await f("Heavily Armored|PHB"); check(eff(d, "proficiency").some((e: any) => /Armor: heavy armor/.test(e.value)), "Heavily Armored");
d = await f("Ritual Caster|PHB"); check(/INT 13\+ or WIS 13\+/.test(d.prerequisite), `Ritual Caster prereq: ${d.prerequisite}`);
d = await f("Fey Touched|TCE"); check((d.grantedSpells ?? []).some((g: any) => g.spell.name === "Misty Step") && (d.spellPicks ?? []).length === 1, "Fey Touched spells");
d = await f("Skill Expert|TCE"); check(d.choices.some((c: any) => c.kind === "expertise"), "Skill Expert expertise");
console.log(bad.length ? bad.slice(0, 80).join("\n") : "ALL OK", `\n${bad.length} problems`);
