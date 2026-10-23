/** What each weapon property means (PHB 2014, p. 146–147), shown with weapons. */
export const PROPERTY_TEXT: Record<string, string> = {
  ammunition: "Needs ammunition to make a ranged attack; drawing it is part of the attack. You can recover half your expended ammunition after the battle.",
  finesse: "Use your choice of Strength or Dexterity for the attack and damage rolls (the same for both).",
  heavy: "Small creatures have disadvantage on attack rolls with it.",
  light: "Small and easy to handle: ideal for fighting with two weapons (attack with the other light weapon as a bonus action).",
  loading: "You can fire only one piece of ammunition from it when you use an action, bonus action or reaction, however many attacks you have.",
  range: "Two ranges: normal and long. Attacks beyond normal range have disadvantage; you can't attack beyond long range.",
  reach: "Adds 5 feet to your reach when you attack with it (and for opportunity attacks).",
  special: "Has unusual rules, explained in its description.",
  thrown: "You can throw it for a ranged attack, using the same ability as for a melee attack with it (Strength, or Dexterity if it's finesse).",
  "two-handed": "Requires two hands when you attack with it.",
  versatile: "Can be used with one or two hands; the damage in parentheses is for a two-handed melee attack.",
};

/** "Versatile (1d10)" → "versatile", "Thrown (range 20/60)" → "thrown". */
export const propertyKey = (p: string) => p.toLowerCase().replace(/\s*\(.*$/, "").trim();
