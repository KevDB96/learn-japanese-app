import { useEffect, useMemo, useState } from "react";
import { kanaFixtures, katakanaFixtures, katakanaAdvancedFixtures } from "../../content/kana-fixtures.ts";
import { openLocalRepositories } from "../../lib/storage/repositories.ts";
import type { LearnerProfileId } from "../../lib/storage/types.ts";
import { getMixedKanaAvailability, recognitionQuestion, type PracticeMode } from "./mixed-kana.ts";

const allKana = [...kanaFixtures, ...katakanaFixtures, ...katakanaAdvancedFixtures];
const modes: readonly { id: PracticeMode; label: string }[] = [
  { id: "recognition", label: "Mixed recognition" },
  { id: "reading", label: "Read a word" },
  { id: "words", label: "Short words" },
];

export function MixedKanaPractice({ profileId }: { profileId: LearnerProfileId }) {
  const [states, setStates] = useState<Awaited<ReturnType<typeof loadPracticeState>>>();
  const [mode, setMode] = useState<PracticeMode>("recognition");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPracticeState(profileId).then((value) => { if (!cancelled) setStates(value); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [profileId]);

  const availability = useMemo(() => getMixedKanaAvailability(allKana, states?.concepts ?? []), [states]);
  if (error) return <p role="status">Practice progress is unavailable.</p>;
  if (!states) return <p role="status">Loading practice…</p>;
  if (!availability.ready) return <section className="mixed-practice"><h2>Mixed kana</h2><p>Learn Hiragana and Katakana to unlock mixed practice.</p></section>;
  if (states.dueCount > 0) return <section className="mixed-practice"><h2>Mixed kana</h2><p>{states.dueCount} reviews due. Complete them in Learn before practice.</p></section>;

  const known = availability.introduced;
  const question = mode === "recognition" ? recognitionQuestion(known, index) : undefined;
  const words = availability.eligibleWords;
  const word = words.length ? words[index % words.length] : undefined;
  const options = mode === "reading" && word
    ? [...new Set([word.reading, ...words.filter((item) => item.reading !== word.reading).map((item) => item.reading)])].slice(0, 4)
    : mode === "words" && word
      ? [...new Set([word.meaning, ...words.filter((item) => item.meaning !== word.meaning).map((item) => item.meaning)])].slice(0, 4)
      : [];
  const expected = mode === "recognition" ? question?.answer.glyph : mode === "reading" ? word?.reading : word?.meaning;
  const available = mode === "recognition" ? Boolean(question && question.options.length > 1) : Boolean(word && options.length > 1);
  const choose = (value: string) => setAnswer(value);
  const next = () => { setIndex((value) => value + 1); setAnswer(undefined); };

  return <section className="mixed-practice" aria-label="Mixed kana practice">
    <h2>Mixed kana</h2>
    <p>Manual practice · no review schedule changes</p>
    <div className="practice-mode-list" role="group" aria-label="Practice mode">
      {modes.map((item) => <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => { setMode(item.id); setIndex(0); setAnswer(undefined); }}>{item.label}</button>)}
    </div>
    {!available ? <p>Learn more kana to unlock this drill.</p> : <>
      {mode === "recognition" && question && <><p>Choose the matching kana.</p><h3 lang="ja">{question.prompt.glyph}</h3><div className="practice-answer-grid">{question.options.map((item) => <button key={item.id} type="button" lang="ja" disabled={Boolean(answer)} onClick={() => choose(item.glyph)}>{item.glyph}</button>)}</div></>}
      {mode !== "recognition" && word && <><p>{mode === "reading" ? "Choose the reading." : "Choose the meaning."}</p><h3 lang="ja">{word.display}</h3><div className="practice-answer-grid">{options.map((item) => <button key={item} type="button" lang={mode === "reading" ? "ja" : undefined} disabled={Boolean(answer)} onClick={() => choose(item)}>{item}</button>)}</div></>}
      {answer && <><p role="status">{answer === expected ? "Correct." : `Answer: ${expected}`}</p><button type="button" onClick={next}>Next</button></>}
    </>}
    {mode !== "recognition" && words.length === 0 && <p>Short words unlock as you learn their kana.</p>}
    <p className="practice-word-count">{words.length} short words available</p>
  </section>;
}

async function loadPracticeState(profileId: LearnerProfileId) {
  const repos = await openLocalRepositories(undefined, profileId);
  try {
    const [concepts, due] = await Promise.all([repos.conceptStates.list(), repos.reviews.due(Date.now())]);
    return { concepts, dueCount: due.length };
  } finally { repos.close(); }
}
