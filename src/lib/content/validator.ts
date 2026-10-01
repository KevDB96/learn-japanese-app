import { CONTENT_ID_PATTERN } from "./types.ts";

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Returns stable, actionable errors in catalog traversal order. */
export function validateContent(input: unknown): string[] {
  const issues: string[] = [];
  if (!isRecord(input)) return ["catalog must be an object"];
  const metadata = input.metadata;
  if (!isRecord(metadata) || !Number.isInteger(metadata.schemaVersion) || (metadata.schemaVersion as number) < 1 || !string(metadata.contentVersion)) {
    issues.push("metadata must include schemaVersion (positive integer) and contentVersion (non-empty string)");
  }

  const collections = ["courses", "units", "lessons", "concepts", "sentences"] as const;
  const ids = new Map<string, string>();
  const records = new Map<string, RecordValue>();
  const readArray = (key: string): unknown[] => {
    if (!Array.isArray(input[key])) { issues.push(`${key} must be an array`); return []; }
    return input[key] as unknown[];
  };
  const entities: Record<string, RecordValue[]> = {};
  const register = (raw: unknown, path: string): RecordValue | undefined => {
    if (!isRecord(raw)) { issues.push(`${path} must be an object`); return undefined; }
    if (typeof raw.id !== "string" || !CONTENT_ID_PATTERN.test(raw.id)) {
      issues.push(`${path}.id must match ${CONTENT_ID_PATTERN.source}`);
    } else if (ids.has(raw.id)) {
      issues.push(`${path}.id duplicates ${ids.get(raw.id)} (${raw.id})`);
    } else { ids.set(raw.id, path); records.set(raw.id, raw); }
    if (typeof raw.id === "string") return raw;
    return raw;
  };

  for (const key of collections) {
    entities[key] = readArray(key).flatMap((item, index) => {
      const value = register(item, `${key}[${index}]`);
      return value ? [value] : [];
    });
  }
  const conceptIdsForValidation = (entities.concepts ?? []).map((v) => String(v.id));

  const displayFields = [...(entities.courses ?? []).map((v, i) => [`courses[${i}]`, v] as const),
    ...(entities.units ?? []).map((v, i) => [`units[${i}]`, v] as const),
    ...(entities.lessons ?? []).map((v, i) => [`lessons[${i}]`, v] as const),
    ...(entities.concepts ?? []).map((v, i) => [`concepts[${i}]`, v] as const),
    ...(entities.sentences ?? []).map((v, i) => [`sentences[${i}]`, v] as const)];
  for (const [path, value] of displayFields) if (!string(value.display)) issues.push(`${path}.display is required`);
  for (const kind of ["concepts", "sentences"] as const) {
    (entities[kind] ?? []).forEach((value, index) => {
      const path = `${kind}[${index}]`;
      for (const field of ["reading", "translation"]) if (!string(value[field])) issues.push(`${path}.${field} is required`);
    });
  }
  (entities.sentences ?? []).forEach((sentence, index) => {
    const path = `sentences[${index}]`;
    if (!Array.isArray(sentence.requires)) issues.push(`${path}.requires must be an array`);
    else sentence.requires.forEach((id, j) => {
      if (typeof id !== "string" || !CONTENT_ID_PATTERN.test(id)) issues.push(`${path}.requires[${j}] must be a valid content ID`);
      else if (![...conceptIdsForValidation].includes(id)) issues.push(`${path}.requires references missing concept "${id}"`);
    });
    if (!Array.isArray(sentence.segments) || sentence.segments.length === 0) { issues.push(`${path}.segments must contain at least one segment`); return; }
    const declaredRequirements = new Set(Array.isArray(sentence.requires) ? sentence.requires.filter((id): id is string => typeof id === "string") : []);
    sentence.segments.forEach((raw, j) => {
      const segmentPath = `${path}.segments[${j}]`;
      if (!isRecord(raw)) { issues.push(`${segmentPath} must be an object`); return; }
      for (const field of ["japanese", "reading", "meaning"]) if (!string(raw[field])) issues.push(`${segmentPath}.${field} is required`);
      if (!Array.isArray(raw.conceptIds) || raw.conceptIds.length === 0) issues.push(`${segmentPath}.conceptIds must contain at least one concept`);
      else raw.conceptIds.forEach((id, k) => {
        if (typeof id !== "string" || !CONTENT_ID_PATTERN.test(id)) issues.push(`${segmentPath}.conceptIds[${k}] must be a valid content ID`);
        else {
          if (!conceptIdsForValidation.includes(id)) issues.push(`${segmentPath}.conceptIds references missing concept "${id}"`);
          if (!declaredRequirements.has(id)) issues.push(`${segmentPath}.conceptIds concept "${id}" must be included in sentence requires`);
        }
      });
    });
  });

  const refs = (record: RecordValue, field: string, path: string): string[] => {
    if (!Array.isArray(record[field])) { issues.push(`${path}.${field} must be an array`); return []; }
    const result: string[] = [];
    (record[field] as unknown[]).forEach((ref, index) => {
      if (typeof ref !== "string" || !CONTENT_ID_PATTERN.test(ref)) issues.push(`${path}.${field}[${index}] must be a valid content ID`);
      else result.push(ref);
    });
    return result;
  };
  const requireRefs = (record: RecordValue, field: string, path: string, targets: string[], label = field) => {
    for (const id of refs(record, field, path)) if (!targets.includes(id)) issues.push(`${path}.${field} references missing ${label} "${id}"`);
  };
  const courseLessons = new Map<string, Set<string>>();
  const unitLessons = new Map<string, string[]>();
  for (const [i, unit] of (entities.units ?? []).entries()) {
    const path = `units[${i}]`;
    const lessonIds = refs(unit, "lessonIds", path);
    unitLessons.set(typeof unit.id === "string" ? unit.id : path, lessonIds);
    requireRefs(unit, "lessonIds", path, (entities.lessons ?? []).map((lesson) => String(lesson.id)), "lesson");
  }
  for (const [i, course] of (entities.courses ?? []).entries()) {
    const path = `courses[${i}]`;
    const unitIds = refs(course, "unitIds", path);
    requireRefs(course, "unitIds", path, (entities.units ?? []).map((unit) => String(unit.id)), "unit");
    const lessonIds = new Set(unitIds.flatMap((id) => unitLessons.get(id) ?? []));
    courseLessons.set(typeof course.id === "string" ? course.id : path, lessonIds);
    const starts = refs(course, "startLessonIds", path);
    if (starts.length === 0) issues.push(`${path}.startLessonIds must include at least one lesson`);
    for (const id of starts) {
      if (!records.has(id) || !(entities.lessons ?? []).some((lesson) => lesson.id === id)) issues.push(`${path}.startLessonIds references missing lesson "${id}"`);
      else if (!lessonIds.has(id)) issues.push(`${path}.startLessonIds lesson "${id}" is not in this course`);
    }
  }

  const lessonsById = new Map<string, RecordValue>((entities.lessons ?? []).filter((l) => typeof l.id === "string").map((l) => [String(l.id), l]));
  const conceptIds = (entities.concepts ?? []).map((v) => String(v.id));
  const sentenceIds = (entities.sentences ?? []).map((v) => String(v.id));
  const sentenceRefs = new Map<string, string[]>();
  const conceptRefs = new Map<string, string[]>();
  const lessonRequires = new Map<string, string[]>();
  for (const [i, lesson] of (entities.lessons ?? []).entries()) {
    const path = `lessons[${i}]`;
    const id = typeof lesson.id === "string" ? lesson.id : path;
    const requires = refs(lesson, "requires", path);
    lessonRequires.set(id, requires);
    requireRefs(lesson, "requires", path, [...lessonsById.keys()], "lesson prerequisite");
    requireRefs(lesson, "introduces", path, [...conceptIds, ...sentenceIds], "concept or sentence");
    requireRefs(lesson, "reinforces", path, [...conceptIds, ...sentenceIds], "concept or sentence");
    if (Array.isArray(lesson.blocks)) lesson.blocks.forEach((block, j) => {
      const blockPath = `${path}.blocks[${j}]`;
      const value = register(block, blockPath);
      if (!value) return;
      if (!string(value.kind)) { issues.push(`${blockPath}.kind is required`); return; }
      const requiredString = (field: string) => { if (!string(value[field])) issues.push(`${blockPath}.${field} is required`); };
      const stringArray = (field: string, requiredFields: readonly string[]) => {
        if (!Array.isArray(value[field])) { issues.push(`${blockPath}.${field} must be an array`); return; }
        (value[field] as unknown[]).forEach((item, index) => {
          if (!isRecord(item)) { issues.push(`${blockPath}.${field}[${index}] must be an object`); return; }
          for (const name of requiredFields) if (!string(item[name])) issues.push(`${blockPath}.${field}[${index}].${name} is required`);
          if (item.reading !== undefined && !string(item.reading)) issues.push(`${blockPath}.${field}[${index}].reading must be a non-empty string`);
        });
      };
      if (value.kind === "text") {
        if (!string(value.display)) issues.push(`${blockPath}.display is required`);
        if (!string(value.translation)) issues.push(`${blockPath}.translation is required`);
      } else if (value.kind === "heading") {
        requiredString("text");
        if (value.level !== undefined && value.level !== 2 && value.level !== 3) issues.push(`${blockPath}.level must be 2 or 3`);
      } else if (value.kind === "paragraph") requiredString("text");
      else if (value.kind === "japanese-example") {
        requiredString("japanese");
        for (const field of ["reading", "translation"]) if (value[field] !== undefined && !string(value[field])) issues.push(`${blockPath}.${field} must be a non-empty string`);
      } else if (value.kind === "callout") requiredString("text");
      else if (value.kind === "kana-grid") { requiredString("title"); stringArray("characters", ["kana", "reading"]); }
      else if (value.kind === "character-comparison") { requiredString("title"); stringArray("pairs", ["hiragana", "katakana", "reading"]); }
      else if (value.kind === "vocabulary-list") stringArray("items", ["japanese", "reading", "translation"]);
      else if (value.kind === "grammar-breakdown") { requiredString("japanese"); requiredString("translation"); stringArray("parts", ["text", "meaning"]); }
      else if (value.kind === "audio") { requiredString("reference"); requiredString("label"); }
      else if (value.kind === "exercise-slot") {
        requiredString("title");
        if (!Array.isArray(value.exercises)) issues.push(`${blockPath}.exercises must be an array`);
        else value.exercises.forEach((rawExercise, k) => {
          const exercisePath = `${blockPath}.exercises[${k}]`;
          const exercise = register(rawExercise, exercisePath);
          if (!exercise) return;
          for (const field of ["prompt", "type"]) if (!string(exercise[field])) issues.push(`${exercisePath}.${field} is required`);
          const feedback = exercise.feedback;
          if (!isRecord(feedback)) issues.push(`${exercisePath}.feedback must be an object`);
          else for (const field of ["success", "explanation"]) if (!string(feedback[field])) issues.push(`${exercisePath}.feedback.${field} is required`);
          if (exercise.type !== "sentence-order" && !string(exercise.answer)) issues.push(`${exercisePath}.answer is required`);
          if (exercise.type === "multiple-choice" || exercise.type === "character-selection" || exercise.type === "audio-choice") {
            if (!Array.isArray(exercise.options) || exercise.options.length < 2 || exercise.options.some((option) => !string(option))) issues.push(`${exercisePath}.options must contain at least two non-empty strings`);
            if (exercise.type === "audio-choice" && (!string(exercise.audioId) || !["glyph", "reading", "meaning"].includes(String(exercise.target)))) issues.push(`${exercisePath} audioId and target are required`);
          } else if (exercise.type === "short-text") {
            if (exercise.acceptedAnswers !== undefined && (!Array.isArray(exercise.acceptedAnswers) || exercise.acceptedAnswers.some((answer) => !string(answer)))) issues.push(`${exercisePath}.acceptedAnswers must contain non-empty strings`);
            if (exercise.normalizeWhitespace !== undefined && typeof exercise.normalizeWhitespace !== "boolean") issues.push(`${exercisePath}.normalizeWhitespace must be boolean`);
          } else if (exercise.type === "cloze") {
            if (!string(exercise.before) || !string(exercise.after) || !string(exercise.explanation)) issues.push(`${exercisePath} cloze context and explanation are required`);
            if (exercise.acceptedAnswers !== undefined && (!Array.isArray(exercise.acceptedAnswers) || exercise.acceptedAnswers.some((answer) => !string(answer)))) issues.push(`${exercisePath}.acceptedAnswers must contain non-empty strings`);
          } else if (exercise.type === "sentence-order") {
            const chunks = exercise.chunks;
            const ids = Array.isArray(chunks) ? chunks.map((chunk) => chunk?.id) : [];
            const orderValid = (order: unknown) => Array.isArray(order) && order.length === ids.length && new Set(order).size === ids.length && ids.every((id) => order.includes(id));
            if (!Array.isArray(chunks) || chunks.length < 2 || chunks.some((chunk) => !isRecord(chunk) || !string(chunk.id) || !string(chunk.japanese) || !string(chunk.reading) || !string(chunk.meaning))) issues.push(`${exercisePath}.chunks must contain at least two complete authored chunks`);
            if (new Set(ids).size !== ids.length) issues.push(`${exercisePath}.chunks must have unique IDs`);
            if (!orderValid(exercise.answerOrder)) issues.push(`${exercisePath}.answerOrder must be a permutation of chunk IDs`);
            if (exercise.acceptedOrders !== undefined && (!Array.isArray(exercise.acceptedOrders) || exercise.acceptedOrders.some((order) => !orderValid(order)))) issues.push(`${exercisePath}.acceptedOrders must contain permutations of chunk IDs`);
            if (!string(exercise.explanation)) issues.push(`${exercisePath}.explanation is required`);
          } else issues.push(`${exercisePath}.type "${String(exercise.type)}" is unknown`);
        });
      }
      else if (value.kind === "checkpoint") { requiredString("title"); if (!Array.isArray(value.points) || value.points.some((point) => !string(point))) issues.push(`${blockPath}.points must be an array of non-empty strings`); }
      else if (value.kind === "concept-ref") {
        if (typeof value.conceptId !== "string" || !conceptIds.includes(value.conceptId)) issues.push(`${blockPath}.conceptId references missing concept "${String(value.conceptId ?? "")}"`);
        else conceptRefs.set(value.conceptId, [...(conceptRefs.get(value.conceptId) ?? []), id]);
      } else if (value.kind === "sentence-ref") {
        if (typeof value.sentenceId !== "string" || !sentenceIds.includes(value.sentenceId)) issues.push(`${blockPath}.sentenceId references missing sentence "${String(value.sentenceId ?? "")}"`);
        else sentenceRefs.set(value.sentenceId, [...(sentenceRefs.get(value.sentenceId) ?? []), id]);
      } else issues.push(`${blockPath}.kind "${value.kind}" is unknown`);
    });
    else issues.push(`${path}.blocks must be an array`);
  }

  const cycleVisited = new Set<string>();
  const active = new Set<string>();
  const cycleReported = new Set<string>();
  const visit = (id: string, chain: string[]) => {
    if (active.has(id)) {
      const cycle = [...chain.slice(chain.indexOf(id)), id];
      const key = [...cycle.slice(0, -1)].sort().join("|");
      if (!cycleReported.has(key)) { cycleReported.add(key); issues.push(`lesson dependency cycle: ${cycle.join(" -> ")}`); }
      return;
    }
    if (cycleVisited.has(id)) return;
    active.add(id);
    for (const prerequisite of lessonRequires.get(id) ?? []) if (lessonsById.has(prerequisite)) visit(prerequisite, [...chain, id]);
    active.delete(id);
    cycleVisited.add(id);
  };
  for (const id of lessonsById.keys()) visit(id, []);

  const assignedLessons = new Set<string>();
  for (const [courseId, idsInCourse] of courseLessons) {
    for (const id of idsInCourse) assignedLessons.add(id);
    const course = (entities.courses ?? []).find((item) => item.id === courseId);
    if (!course) continue;
    const starts = refs(course, "startLessonIds", `course ${courseId}`);
    const reached = new Set(starts.filter((id) => idsInCourse.has(id)));
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of idsInCourse) {
        if (reached.has(id)) continue;
        const prereqs = lessonRequires.get(id) ?? [];
        if (prereqs.every((required) => reached.has(required))) { reached.add(id); changed = true; }
      }
    }
    for (const id of idsInCourse) if (!reached.has(id)) issues.push(`course "${courseId}" cannot reach lesson "${id}" from its start lessons (missing prerequisite path)`);
  }
  for (const id of lessonsById.keys()) if (!assignedLessons.has(id)) issues.push(`lesson "${id}" is not assigned to any course`);
  for (const [conceptId, lessonIds] of conceptRefs) for (const lessonId of lessonIds) {
    const availableLessons = new Set<string>();
    const collect = (current: string) => { if (availableLessons.has(current)) return; availableLessons.add(current); for (const required of lessonRequires.get(current) ?? []) collect(required); };
    collect(lessonId);
    const availableConcepts = new Set<string>();
    for (const current of availableLessons) {
      const lesson = lessonsById.get(current);
      if (lesson) for (const concept of [...(Array.isArray(lesson.introduces) ? lesson.introduces : []), ...(Array.isArray(lesson.reinforces) ? lesson.reinforces : [])]) if (typeof concept === "string") availableConcepts.add(concept);
    }
    if (!availableConcepts.has(conceptId)) issues.push(`concept "${conceptId}" is used before it is introduced or reinforced in lesson "${lessonId}"`);
  }
  for (const sentence of entities.sentences ?? []) {
    const refsToSentence = sentenceRefs.get(String(sentence.id)) ?? [];
    if (refsToSentence.length === 0) issues.push(`sentence "${String(sentence.id)}" is unreachable from any lesson`);
    for (const lessonId of refsToSentence) {
      const availableLessons = new Set<string>();
      const collect = (current: string) => { if (availableLessons.has(current)) return; availableLessons.add(current); for (const required of lessonRequires.get(current) ?? []) collect(required); };
      collect(lessonId);
      const availableConcepts = new Set<string>();
      for (const current of availableLessons) {
        const lesson = lessonsById.get(current);
        if (lesson) for (const concept of [...(Array.isArray(lesson.introduces) ? lesson.introduces : []), ...(Array.isArray(lesson.reinforces) ? lesson.reinforces : [])]) if (typeof concept === "string") availableConcepts.add(concept);
      }
      for (const required of Array.isArray(sentence.requires) ? sentence.requires : []) if (typeof required === "string" && !availableConcepts.has(required)) issues.push(`sentence "${String(sentence.id)}" requires concept "${required}" unavailable in lesson "${lessonId}"`);
    }
  }
  return issues;
}
