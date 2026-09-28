import type { ContentCatalog, ContentId } from "./types.ts";
import { validateContent } from "./validator.ts";

export class ContentValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid content catalog:\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ContentValidationError";
  }
}

/** Validates and freezes the supplied catalog for deterministic read-only use. */
export function loadContent(catalog: unknown): ContentCatalog {
  const issues = validateContent(catalog);
  if (issues.length > 0) throw new ContentValidationError(issues);
  return deepFreeze(catalog) as ContentCatalog;
}

export function createContentRegistry(catalog: unknown) {
  const content = loadContent(catalog);
  const byId = new Map<ContentId, object>();
  for (const collection of [content.courses, content.units, content.lessons, content.concepts, content.sentences]) {
    for (const item of collection) byId.set(item.id, item);
  }
  for (const lesson of content.lessons) for (const block of lesson.blocks) byId.set(block.id, block);

  return Object.freeze({
    content,
    get<T extends object = object>(id: ContentId): T | undefined {
      return byId.get(id) as T | undefined;
    },
    has(id: ContentId): boolean {
      return byId.has(id);
    },
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
