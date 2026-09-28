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
      if (value.kind === "text") {
        if (!string(value.display)) issues.push(`${blockPath}.display is required`);
        if (!string(value.translation)) issues.push(`${blockPath}.translation is required`);
      } else if (value.kind === "concept-ref") {
        if (typeof value.conceptId !== "string" || !conceptIds.includes(value.conceptId)) issues.push(`${blockPath}.conceptId references missing concept "${String(value.conceptId ?? "")}"`);
      } else if (value.kind === "sentence-ref") {
        if (typeof value.sentenceId !== "string" || !sentenceIds.includes(value.sentenceId)) issues.push(`${blockPath}.sentenceId references missing sentence "${String(value.sentenceId ?? "")}"`);
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
  return issues;
}
