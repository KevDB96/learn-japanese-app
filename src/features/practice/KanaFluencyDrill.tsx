import { useMemo, useState } from "react";
import type { KanaConcept } from "../../lib/content/types.ts";
import type { ConceptState, LearnerProfileId } from "../../lib/storage/types.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import { getReadingAssistance, scoreFluencyRun } from "./assistance.ts";

const TARGET = 5;
const ratings = ["Forgot", "Hard", "Got It", "Easy"] as const;

export function KanaFluencyDrill({ kana, concepts, profileId }: { kana: readonly KanaConcept[]; concepts: readonly ConceptState[]; profileId: LearnerProfileId }) {
  const cards = useMemo(() => kana.filter((item) => item.form === "base" && item.reviewEligible !== false), [kana]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState("");
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [startedAt, setStartedAt] = useState<number>();
  const [wrong, setWrong] = useState(false);
  const [help, setHelp] = useState(false);
  const [rated, setRated] = useState(false);
  const [error, setError] = useState(false);
  const current = cards.length ? cards[(index + answers.length) % cards.length] : undefined;
  const result = scoreFluencyRun(answers, startedAt === undefined ? 0 : Date.now() - startedAt);
  const assistance = getReadingAssistance(concepts.find((item) => item.conceptId === current?.id), help);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!current || result.complete) return;
    const correct = input.trim().toLocaleLowerCase() === current.romanization.toLocaleLowerCase();
    setInput(""); setWrong(!correct);
    if (!correct) return;
    setStartedAt((value) => value ?? Date.now());
    setAnswers((value) => [...value, true]);
  }

  async function rate(rating: typeof ratings[number]) {
    if (!current) return;
    const repos = await openLocalRepositories(undefined, profileId).catch(() => undefined);
    if (!repos) { setError(true); return; }
    try {
      await repos.reviews.record({ id: `fluency-${crypto.randomUUID()}`, conceptId: current.id, cardId: `${current.id}--kana-glyph-to-sound`, rating, reviewedAt: new Date().toISOString(), kind: "practice" });
      setRated(true);
    } catch { setError(true); } finally { repos.close(); }
  }

  return <section aria-label="Kana fluency" className="kana-fluency">
    <h3>Kana fluency</h3>
    <p>Get {TARGET} correct in a row. Time appears after accuracy.</p>
    <label><input type="checkbox" checked={help} onChange={(event) => setHelp(event.target.checked)} /> Romaji help for this session</label>
    {!current ? <p>Learn kana to unlock this drill.</p> : result.complete ? <>
      <p role="status">{result.correct}/{result.total} correct · {(result.elapsedMs! / 1000).toFixed(1)} seconds</p>
      {!rated && <div role="group" aria-label="Rate this fluency practice">Rate for review: {ratings.map((rating) => <button type="button" key={rating} onClick={() => void rate(rating)}>{rating}</button>)}</div>}
      {rated && <p>Practice rated.</p>}{error && <p role="alert">Rating could not be saved.</p>}
      <button type="button" onClick={() => { setAnswers([]); setStartedAt(undefined); setIndex((value) => value + TARGET); setRated(false); setError(false); }}>New run</button>
    </> : <>
      <p>{answers.length}/{TARGET} correct</p>
      <form onSubmit={submit}><label htmlFor="fluency-answer">Reading</label><h4 lang="ja">{current.glyph}</h4>
        {assistance.showRomaji && <p aria-label="Romaji hint">{current.romanization}</p>}
        <input id="fluency-answer" autoComplete="off" value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit">Check</button></form>
      {wrong && <p role="status">Try again.</p>}
    </>}
  </section>;
}
