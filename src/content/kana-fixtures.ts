import type { ContentId, KanaConcept, PronunciationManifest } from "../lib/content/types.ts";

const id = (value: string) => value as ContentId;
const kana = (code: number) => String.fromCodePoint(code);
const baseId = (romanization: string) => `kana-hira-${({ shi: "si", chi: "ti", tsu: "tu" } as Record<string, string>)[romanization] ?? romanization}`;
const baseRows = [
  { codes: [0x304b, 0x304d, 0x304f, 0x3051, 0x3053], roma: ["ka", "ki", "ku", "ke", "ko"] },
  { codes: [0x3055, 0x3057, 0x3059, 0x305b, 0x305d], roma: ["sa", "shi", "su", "se", "so"] },
  { codes: [0x305f, 0x3061, 0x3064, 0x3066, 0x3068], roma: ["ta", "chi", "tsu", "te", "to"] },
  { codes: [0x306f, 0x3072, 0x3075, 0x3078, 0x307b], roma: ["ha", "hi", "fu", "he", "ho"] },
  { codes: [0x3042, 0x3044, 0x3046, 0x3048, 0x304a], roma: ["a", "i", "u", "e", "o"] },
  { codes: [0x306a, 0x306b, 0x306c, 0x306d, 0x306e], roma: ["na", "ni", "nu", "ne", "no"] },
  { codes: [0x307e, 0x307f, 0x3080, 0x3081, 0x3082], roma: ["ma", "mi", "mu", "me", "mo"] },
  { codes: [0x3084, 0, 0x3086, 0, 0x3088], roma: ["ya", "", "yu", "", "yo"] },
  { codes: [0x3089, 0x308a, 0x308b, 0x308c, 0x308d], roma: ["ra", "ri", "ru", "re", "ro"] },
  { codes: [0x308f, 0, 0, 0, 0x3092], roma: ["wa", "", "", "", "wo"] },
  { codes: [0x3093, 0, 0, 0, 0], roma: ["n", "", "", "", ""] },
] as const;
const bases: KanaConcept[] = [...baseRows.flatMap(({ codes, roma }) => roma.flatMap((romanization, order) => romanization ? [{
  id: id(baseId(romanization)), script: "hiragana" as const, glyph: kana(codes[order]!), romanization,
  row: `${romanization[0]}-row`, order, form: "base" as const, componentIds: [],
}] : []))];
const marks = [
  { row: 0, codes: [0x304c, 0x304e, 0x3050, 0x3052, 0x3054], sound: "g" },
  { row: 1, codes: [0x3056, 0x3058, 0x305a, 0x305c, 0x305e], sound: "z" },
  { row: 2, codes: [0x3060, 0x3062, 0x3065, 0x3067, 0x3069], sound: "d" },
  { row: 3, codes: [0x3070, 0x3073, 0x3076, 0x3079, 0x307c], sound: "b" },
  { row: 3, codes: [0x3071, 0x3074, 0x3077, 0x307a, 0x307d], sound: "p" },
] as const;
const marked: KanaConcept[] = marks.flatMap(({ row, codes, sound }) => Array.from({ length: 5 }, (_, order) => {
  const source = bases.find((item) => item.glyph === kana(baseRows[row]!.codes[order]!))!;
  const romanization = sound === "z" && source.romanization === "shi" ? "ji"
    : sound === "d" && source.romanization === "chi" ? "ji"
    : sound === "d" && source.romanization === "tsu" ? "zu"
    : `${sound}${source.romanization.slice(1)}`;
  return { id: id(`kana-hira-${codes[order]!.toString(16)}`), script: "hiragana" as const,
    glyph: kana(codes[order]!), romanization, row: `${sound}-row`, order,
    form: "marked" as const, componentIds: [source.id] };
}));
const small: KanaConcept[] = [
  { id: id("kana-hira-small-ya"), script: "hiragana", glyph: kana(0x3083), romanization: "ya", row: "y-row", order: 1, form: "small", componentIds: [] },
  { id: id("kana-hira-small-yu"), script: "hiragana", glyph: kana(0x3085), romanization: "yu", row: "y-row", order: 2, form: "small", componentIds: [] },
  { id: id("kana-hira-small-yo"), script: "hiragana", glyph: kana(0x3087), romanization: "yo", row: "y-row", order: 3, form: "small", componentIds: [] },
  { id: id("kana-hira-small-tsu"), script: "hiragana", glyph: kana(0x3063), romanization: "small tsu", row: "small-kana", order: 0, form: "small", componentIds: [] },
];
const yoonBase = ["ki", "gi", "shi", "ji", "chi", "ni", "hi", "bi", "pi", "mi", "ri"];
const yoon: KanaConcept[] = yoonBase.flatMap((roman) => [
  { suffix: "ya", glyph: 0x3083 }, { suffix: "yu", glyph: 0x3085 }, { suffix: "yo", glyph: 0x3087 },
].map(({ suffix, glyph }) => {
  const base = [...bases, ...marked].find((item) => item.romanization === roman)!;
  return { id: id(`kana-hira-yoon-${base.glyph.codePointAt(0)!.toString(16)}-${glyph.toString(16)}`), script: "hiragana" as const,
    glyph: `${base.glyph}${kana(glyph)}`, romanization: `${roman === "shi" ? "sh" : roman === "chi" ? "ch" : roman === "ji" ? "j" : roman[0]}${["shi", "chi", "ji"].includes(roman) ? suffix.slice(1) : suffix}`, row: `yoon-${roman}`, order: glyph,
    form: "contracted" as const, componentIds: [base.id, id(`kana-hira-small-${suffix}`)], reviewEligible: false };
}));
export const kanaFixtures: readonly KanaConcept[] = [...bases, ...marked, ...small, ...yoon];
export const kanaAudioManifest: PronunciationManifest = { version: 1, entries: [] };
