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

const katakanaRows = [
  { name: "a", codes: [0x30a2, 0x30a4, 0x30a6, 0x30a8, 0x30aa], sounds: ["a", "i", "u", "e", "o"] },
  { name: "k", codes: [0x30ab, 0x30ad, 0x30af, 0x30b1, 0x30b3], sounds: ["ka", "ki", "ku", "ke", "ko"] },
  { name: "s", codes: [0x30b5, 0x30b7, 0x30b9, 0x30bb, 0x30bd], sounds: ["sa", "shi", "su", "se", "so"] },
  { name: "t", codes: [0x30bf, 0x30c1, 0x30c4, 0x30c6, 0x30c8], sounds: ["ta", "chi", "tsu", "te", "to"] },
  { name: "n", codes: [0x30ca, 0x30cb, 0x30cc, 0x30cd, 0x30ce], sounds: ["na", "ni", "nu", "ne", "no"] },
  { name: "h", codes: [0x30cf, 0x30d2, 0x30d5, 0x30d8, 0x30db], sounds: ["ha", "hi", "fu", "he", "ho"] },
  { name: "m", codes: [0x30de, 0x30df, 0x30e0, 0x30e1, 0x30e2], sounds: ["ma", "mi", "mu", "me", "mo"] },
  { name: "y", codes: [0x30e4, 0x30e6, 0x30e8], sounds: ["ya", "yu", "yo"] },
  { name: "r", codes: [0x30e9, 0x30ea, 0x30eb, 0x30ec, 0x30ed], sounds: ["ra", "ri", "ru", "re", "ro"] },
  { name: "w", codes: [0x30ef, 0x30f2, 0x30f3], sounds: ["wa", "wo", "n"] },
] as const;

export const katakanaFixtures: readonly KanaConcept[] = katakanaRows.flatMap(({ name, codes, sounds }) =>
  codes.map((code, order) => ({
    id: id(`kana-kata-${sounds[order]}`), script: "katakana" as const, glyph: kana(code),
    romanization: sounds[order]!, row: `${name}-row`, order, form: "base" as const, componentIds: [],
  })),
);

const kataBase = (glyph: string) => katakanaFixtures.find((item) => item.glyph === glyph) ?? kataMarked.find((item) => item.glyph === glyph)!;
const kataSmall = (glyph: string, romanization: string, order: number): KanaConcept => ({
  id: id(`kana-kata-small-${glyph.codePointAt(0)!.toString(16)}`), script: "katakana", glyph, romanization,
  row: "small-kana", order, form: "small", componentIds: [], reviewEligible: false,
});
const kataMarkedRows = [
  { plain: "カキクケコ", marked: "ガギグゲゴ", roma: ["ga", "gi", "gu", "ge", "go"] },
  { plain: "サシスセソ", marked: "ザジズゼゾ", roma: ["za", "ji", "zu", "ze", "zo"] },
  { plain: "タチツテト", marked: "ダヂヅデド", roma: ["da", "ji", "zu", "de", "do"] },
  { plain: "ハヒフヘホ", marked: "バビブベボ", roma: ["ba", "bi", "bu", "be", "bo"] },
  { plain: "ハヒフヘホ", marked: "パピプペポ", roma: ["pa", "pi", "pu", "pe", "po"] },
];
const kataMarked: KanaConcept[] = kataMarkedRows.flatMap(({ plain, marked, roma }, row) => [...marked].map((glyph, order) => ({
  id: id(`kana-kata-mark-${glyph.codePointAt(0)!.toString(16)}`), script: "katakana" as const, glyph,
  romanization: roma[order]!, row: row === 4 ? "p-row" : `${roma[0]![0]}-row`, order, form: "marked" as const,
  componentIds: [kataBase([...plain][order]!).id],
})));
const kataSmallKana = [
  kataSmall("ァ", "small a", 0), kataSmall("ィ", "small i", 1), kataSmall("ゥ", "small u", 2),
  kataSmall("ェ", "small e", 3), kataSmall("ォ", "small o", 4), kataSmall("ャ", "small ya", 5),
  kataSmall("ュ", "small yu", 6), kataSmall("ョ", "small yo", 7), kataSmall("ッ", "sokuon", 8),
];
const kataYoonBases = ["キ", "ギ", "シ", "ジ", "チ", "ヂ", "ニ", "ヒ", "ビ", "ピ", "ミ", "リ"];
const kataYoon: KanaConcept[] = kataYoonBases.flatMap((glyph) => {
  const base = [...katakanaFixtures, ...kataMarked].find((item) => item.glyph === glyph)!;
  const onset = base.romanization.startsWith("sh") ? "sh" : base.romanization.startsWith("ch") ? "ch" : base.romanization.startsWith("j") ? "j" : base.romanization[0]!;
  return ["ャ", "ュ", "ョ"].map((smallGlyph, index) => ({
    id: id(`kana-kata-yoon-${base.glyph.codePointAt(0)!.toString(16)}-${smallGlyph.codePointAt(0)!.toString(16)}`),
    script: "katakana" as const, glyph: `${glyph}${smallGlyph}`, romanization: `${onset}${["a", "u", "o"][index]!}`,
    row: `yoon-${base.romanization}`, order: index, form: "contracted" as const,
    componentIds: [base.id, kataSmallKana[5 + index]!.id], reviewEligible: false,
  }));
});
const extendedPairs = [
  ["テ", "ィ", "ti"], ["デ", "ィ", "di"], ["フ", "ァ", "fa"], ["フ", "ィ", "fi"], ["フ", "ェ", "fe"],
  ["フ", "ォ", "fo"], ["ウ", "ィ", "wi"], ["ウ", "ェ", "we"], ["ウ", "ォ", "wo"], ["チ", "ェ", "che"],
] as const;
const kataExtended: KanaConcept[] = extendedPairs.map(([baseGlyph, smallGlyph, romanization]) => ({
  id: id(`kana-kata-extended-${[...baseGlyph + smallGlyph].map((char) => char.codePointAt(0)!.toString(16)).join("-")}`),
  script: "katakana", glyph: `${baseGlyph}${smallGlyph}`, romanization, row: "extended-loanword", order: extendedPairs.findIndex((item) => item[0] === baseGlyph && item[1] === smallGlyph),
  form: "contracted", componentIds: [kataBase(baseGlyph).id, kataSmallKana.find((item) => item.glyph === smallGlyph)!.id], reviewEligible: false,
}));
export const katakanaAdvancedFixtures: readonly KanaConcept[] = [
  ...kataMarked, ...kataSmallKana, ...kataYoon, ...kataExtended,
  { id: id("kana-kata-long-vowel-mark"), script: "katakana", glyph: "\u30fc", romanization: "long vowel mark", row: "loanword-markers", order: 0, form: "marker", componentIds: [], reviewEligible: false },
];
export const kanaAudioManifest: PronunciationManifest = { version: 1, entries: [] };
