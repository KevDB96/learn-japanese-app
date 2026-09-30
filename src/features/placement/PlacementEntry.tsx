import { useMemo, useState } from "react";
import { kanaFixtures, katakanaFixtures, katakanaAdvancedFixtures } from "../../content/kana-fixtures.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import type { ConceptState, LearnerProfileId } from "../../lib/storage/types.ts";
import { buildPlacementQuestions, scorePlacement, type PlacementAnswer, type PlacementScript } from "./placement.ts";

const allKana = [...kanaFixtures, ...katakanaFixtures, ...katakanaAdvancedFixtures];
const choices = ["Hiragana", "Katakana", "Mixed kana"] as const;
const labels: Record<PlacementScript, string> = { hiragana: choices[0], katakana: choices[1], mixed: choices[2] };
const stamp = () => new Date().toISOString();

export function PlacementEntry({ profileId }: { profileId: LearnerProfileId }) {
  const [script, setScript] = useState<PlacementScript>();
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const questions = useMemo(() => script ? buildPlacementQuestions(allKana, script, 18) : [], [script]);
  const result = scorePlacement(questions, answers);

  async function unlock(anyway = false) {
    if (!script || (!anyway && !result.passed)) return;
    try {
      const repos = await openLocalRepositories(undefined, profileId);
      try {
        const now = stamp();
        const selected = allKana.filter((item) => script === "mixed" || item.script === script);
        for (const item of selected) {
          const previous = await repos.conceptStates.get(item.id);
          const lifecycle: ConceptState["lifecycle"] = previous?.lifecycle && previous.lifecycle !== "UNSEEN" ? previous.lifecycle : "INTRODUCED";
          await repos.conceptStates.put({ id: item.id, ...(previous ?? {}), recordVersion: previous?.recordVersion ?? 1, updatedAt: now, conceptId: item.id, lifecycle, familiarity: previous?.familiarity ?? 0 });
        }
      } finally { repos.close(); }
      setUnlocked(true);
    } catch { setError(true); }
  }

  function start(value: PlacementScript) { setScript(value); setAnswers([]); setQuestionIndex(0); setFinished(false); setUnlocked(false); setError(false); }
  function setAnswer(conceptId: string, answer: string) { setAnswers((current) => [...current.filter((item) => item.conceptId !== conceptId), { conceptId, answer }]); }
  const current = questions[questionIndex];

  if (!script) return <section className="placement-entry" aria-label="Placement assessment">
    <h2>Already know kana?</h2><p>Check what you know to skip familiar lessons.</p>
    <div className="placement-levels">{(["hiragana", "katakana", "mixed"] as const).map((value) => <button type="button" key={value} onClick={() => start(value)}>Assess {labels[value]}</button>)}</div>
  </section>;

  if (unlocked) return <section className="placement-entry" aria-live="polite"><h2>Lessons unlocked</h2><p>{labels[script]} concepts are introduced. Your review history is unchanged.</p><button type="button" onClick={() => start(script)}>Retake placement</button><button type="button" onClick={() => setScript(undefined)}>Done</button></section>;

  if (finished) return <section className="placement-entry" aria-live="polite">
    <h2>{labels[script]} placement</h2><p>Score: {result.correct} / {result.total}</p>
    <p>Hiragana {result.hiragana.correct}/{result.hiragana.total} · Katakana {result.katakana.correct}/{result.katakana.total} · Combinations {result.combinations.correct}/{result.combinations.total}</p>
    <p>{result.passed ? "Placement passed. Unlocking introduces concepts without marking them mastered." : "Below the placement threshold. You can still unlock and skip these lessons."}</p>
    {error && <p role="alert">Could not save placement.</p>}
    {result.passed && <button type="button" onClick={() => void unlock()}>Unlock assessed lessons</button>}
    <button type="button" onClick={() => void unlock(true)}>Unlock Anyway</button>
    <button type="button" onClick={() => start(script)}>Retake placement</button>
    <button type="button" onClick={() => setScript(undefined)}>Back</button>
  </section>;

  if (!current) { setFinished(true); return null; }
  const selected = answers.find((item) => item.conceptId === current.conceptId)?.answer ?? "";
  return <section className="placement-entry" aria-label={`${labels[script]} assessment`}>
    <h2>{labels[script]} · {questionIndex + 1} / {questions.length}</h2>
    <p>Enter the reading for this kana.</p><h3 lang="ja">{current.glyph}</h3>
    <label>Reading <input autoComplete="off" value={selected} onChange={(event) => setAnswer(current.conceptId, event.target.value)} /></label>
    <div className="placement-actions"><button type="button" disabled={!selected.trim()} onClick={() => questionIndex + 1 === questions.length ? setFinished(true) : setQuestionIndex((value) => value + 1)}>Check</button>
      {questionIndex > 0 && <button type="button" onClick={() => setQuestionIndex((value) => value - 1)}>Previous</button>}
      <button type="button" onClick={() => { setAnswers([]); setQuestionIndex(0); }}>Retake from start</button>
    </div>
  </section>;
}
