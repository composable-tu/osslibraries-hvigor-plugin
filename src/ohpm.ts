/**
 * Copyright (c) 2026 composable-tu
 * OSSLibraries Hvigor Plugin is licensed under Mulan PSL v2.
 * You can use this software according to the terms and conditions of the Mulan PSL v2.
 * You may obtain a copy of Mulan PSL v2 at:
 *          http://license.coscl.org.cn/MulanPSL2
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
 * EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
 * MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
 * See the Mulan PSL v2 for more details.
 */

/**
 * oh-package.json5 reading and normalization.
 *
 * OHPM manifests are JSON5 and several fields are loosely typed (author,
 * repository and license each accept multiple shapes). This module owns that
 * parsing and produces the strict `OhPackage` model used by the rest of the
 * scanner.
 */

import * as fs from "fs";
import JSON5 from "json5";
import type { OhPackage } from "./types.js";

/** True when the value is a plain (non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a string field, returning undefined when absent or non-string. */
function str(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

/** Author may be a string or an object `{ name, email, url }`. */
function authorName(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    return raw;
  }
  if (isRecord(raw)) {
    return str(raw, "name");
  }
  return undefined;
}

/** Extract the URL from an author object, when present. */
function authorUrl(raw: unknown): string | undefined {
  if (isRecord(raw)) {
    return str(raw, "url");
  }
  return undefined;
}

/** Repository may be a string or an object `{ url }`. */
function repoUrl(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    return raw;
  }
  if (isRecord(raw)) {
    return str(raw, "url");
  }
  return undefined;
}

/** License may be a single string or an array of strings. */
function licenseDecls(raw: unknown): string[] {
  if (typeof raw === "string") {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }
  return [];
}

/** Extract a string array field, returning empty when absent or non-array. */
function stringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }
  return [];
}

/** Parse a JSON5 string into a plain object (empty object on non-object input). */
export function parseJson5(text: string): Record<string, unknown> {
  const parsed: unknown = JSON5.parse(text);
  return isRecord(parsed) ? parsed : {};
}

/** Convert a raw oh-package.json5 object into the strict `OhPackage` model. */
export function parseOhPackage(obj: Record<string, unknown>): OhPackage {
  const rawAuthor = obj["author"];
  return {
    name: str(obj, "name") ?? "",
    version: str(obj, "version") ?? "",
    description: str(obj, "description") ?? "",
    homepage: str(obj, "homepage") ?? "",
    authorName: authorName(rawAuthor) ?? "",
    authorUrl: authorUrl(rawAuthor) ?? "",
    repoUrl: repoUrl(obj["repository"]) ?? "",
    licenseDecls: licenseDecls(obj["license"]),
    keywords: stringArray(obj["keywords"]),
  };
}

/**
 * Read and parse an oh-package.json5 file. Falls back to `fallbackName` when
 * the manifest omits its name, and returns null when the file is unreadable.
 */
export function readOhPackage(filePath: string, fallbackName: string): OhPackage | null {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  const pkg = parseOhPackage(parseJson5(text));
  if (!pkg.name) {
    pkg.name = fallbackName;
  }
  return pkg;
}
