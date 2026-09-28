import catalogJson from "../../content/catalog.json" with { type: "json" };
import { loadContent } from "./registry.ts";

/** Canonical, validated repository curriculum. */
export const contentCatalog = loadContent(catalogJson);
