/**
 * Build-time OHPM dependency scanner.
 *
 * Walks a project's oh_modules directories, reads each dependency's
 * oh-package.json5, resolves SPDX license IDs using the `spdx-correct` and
 * `spdx-license-list` npm packages, prefers the LICENSE file shipped inside
 * each HAR package for the full license text, and emits OSSLibraries JSON
 * consumed by the OSSLibraries UI library at runtime.
 *
 * Output JSON shape (compatible with OSSLibraries Parser):
 * {
 *   "libraries": [ { ..., "licenses": ["hash1"] } ],
 *   "licenses":  { "hash1": { "hash": "...", "name": "...", "content": "..." } }
 * }
 *
 * @module scanner
 */
"use strict";

import * as fs from "fs";
import * as path from "path";
import JSON5 from "json5";
import correct from "spdx-correct";
import spdxList from "spdx-license-list";

/** Resolved license entry written into the generated JSON. */
export interface LicenseEntry {
  hash: string;
  name: string;
  url: string;
  spdxId: string;
  content: string;
}

/** Library entry written into the generated JSON. */
export interface LibraryEntry {
  uniqueId: string;
  artifactVersion: string;
  name: string;
  description: string;
  website: string;
  developers: Array<{ name: string; organisationUrl: string }>;
  scm: { connection: string; developerConnection: string; url: string } | null;
  organization: unknown;
  funding: unknown[];
  tag: string;
  licenses: string[];
}

/** Result of scanning a project. */
export interface ScanResult {
  libraries: LibraryEntry[];
  licenses: Record<string, LicenseEntry>;
}

/**
 * Module names that belong to the host project and must NOT appear in the
 * generated license list. Callers may extend this via scanProject options.
 */
const DEFAULT_SELF_MODULES = new Set<string>(["entry"]);

/** Parse a JSON5 string into an object. */
export function parseJson5(text: string): Record<string, unknown> {
  const parsed: unknown = JSON5.parse(text);
  return isRecord(parsed) ? parsed : {};
}

/**
 * Resolve a license declaration string to a license entry.
 *
 * A declaration may be:
 *  - a single SPDX id ("Apache-2.0")
 *  - an SPDX expression ("Apache-2.0 OR MIT") — operators (OR/AND/WITH) and
 *    surrounding punctuation are skipped, and each token is corrected and
 *    looked up; the first known id wins
 *  - a free-form license name (corrected/looked-up miss; falls back to a
 *    minimal entry named after the original declaration)
 *
 * Uses `spdx-correct` to fix common misspellings ("apache2" -> "Apache-2.0")
 * and `spdx-license-list` for the canonical name and URL. Full license text
 * (`content`) is intentionally left empty here — the caller fills it from the
 * HAR package's bundled LICENSE file, which is the authoritative source.
 */
export function resolveLicense(declaration: string): LicenseEntry | null {
  if (!declaration || typeof declaration !== "string") {
    return null;
  }
  const trimmed = declaration.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const list = spdxList;

  // Try the whole declaration first (handles exact SPDX ids and simple
  // expressions that spdx-correct can normalize as a unit).
  const correctedWhole = correct(trimmed);
  if (correctedWhole && list[correctedWhole]) {
    const meta = list[correctedWhole];
    return {
      hash: correctedWhole,
      name: meta.name,
      url: meta.url,
      spdxId: correctedWhole,
      content: "",
    };
  }

  // Best-effort SPDX expression handling: split on whitespace, strip
  // surrounding punctuation, and ignore the OR/AND/WITH operators. Only a
  // single license ID is resolved from a possibly complex expression.
  const tokens = trimmed.split(/\s+/);
  for (const tok of tokens) {
    const normalized = tok.replace(/^[()[\],;]+|[()[\],;]+$/g, "");
    if (!normalized || /^(OR|AND|WITH)$/i.test(normalized)) {
      continue;
    }

    const corrected = correct(normalized);
    const id = corrected ?? normalized;
    if (list[id]) {
      const meta = list[id];
      return {
        hash: id,
        name: meta.name,
        url: meta.url,
        spdxId: id,
        content: "",
      };
    }
  }

  // Unknown license — create a minimal entry named after the declaration.
  return {
    hash: trimmed,
    name: trimmed,
    url: "",
    spdxId: "",
    content: "",
  };
}

/** Candidate license file names, checked case-insensitively, in preference order. */
const LICENSE_FILE_NAMES = [
  "LICENSE",
  "LICENSE.txt",
  "LICENSE.md",
  "LICENSE.MIT",
  "LICENSE.APACHE",
  "COPYING",
  "COPYING.txt",
  "NOTICE",
  "NOTICE.txt",
];

/**
 * Find and read the LICENSE file inside a package directory.
 *
 * OHPM-downloaded HAR packages ship their own LICENSE file, which is the
 * authoritative full license text. Returns the contents of the first match,
 * or '' if no file is found.
 */
function readLicenseFile(pkgDir: string): string {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(pkgDir, { withFileTypes: true });
  } catch {
    return "";
  }

  const fileMap: Record<string, string> = {};
  for (const e of entries) {
    if (e.isFile()) {
      fileMap[e.name.toUpperCase()] = e.name;
    }
  }

  for (const candidate of LICENSE_FILE_NAMES) {
    const upper = candidate.toUpperCase();
    if (fileMap[upper]) {
      try {
        return fs.readFileSync(path.join(pkgDir, fileMap[upper]), "utf-8");
      } catch {
        // Continue to next candidate.
      }
    }
  }
  return "";
}

/** True when the value is a plain (non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Safely read a string field from a parsed JSON5 object. */
function getStr(obj: Record<string, unknown>, key: string, fallback: string): string {
  const val = obj[key];
  if (typeof val === "string") {
    return val;
  }
  return fallback;
}

/**
 * Build a library entry from a parsed oh-package.json5 object.
 * Returns the library and its resolved licenses (license text filled from the
 * bundled LICENSE file when available).
 */
export function buildLibrary(
  pkg: Record<string, unknown>,
  pkgDir: string,
): { lib: LibraryEntry; licenses: LicenseEntry[] } {
  const name = getStr(pkg, "name", "");
  const version = getStr(pkg, "version", "");
  const description = getStr(pkg, "description", "");
  const homepage = getStr(pkg, "homepage", "");

  // Author may be a string or an object {name, email}
  let authorName = "";
  const authorRaw = pkg["author"];
  if (typeof authorRaw === "string") {
    authorName = authorRaw;
  } else if (isRecord(authorRaw)) {
    authorName = getStr(authorRaw, "name", "");
  }

  // Repository may be a string or {url}
  let repoUrl = "";
  const repoRaw = pkg["repository"];
  if (typeof repoRaw === "string") {
    repoUrl = repoRaw;
  } else if (isRecord(repoRaw)) {
    repoUrl = getStr(repoRaw, "url", "");
  }

  // License may be a string or an array
  const licenseDecls: string[] = [];
  const licenseRaw = pkg["license"];
  if (typeof licenseRaw === "string") {
    licenseDecls.push(licenseRaw);
  } else if (Array.isArray(licenseRaw)) {
    for (const l of licenseRaw) {
      if (typeof l === "string") {
        licenseDecls.push(l);
      }
    }
  }

  const licenseFileContent = readLicenseFile(pkgDir);

  const resolvedLicenses: LicenseEntry[] = [];
  for (const decl of licenseDecls) {
    const lic = resolveLicense(decl);
    if (lic) {
      if (licenseFileContent.length > 0) {
        lic.content = licenseFileContent;
      }
      resolvedLicenses.push(lic);
    }
  }

  // No license declared in oh-package.json5, but a LICENSE file exists.
  if (resolvedLicenses.length === 0 && licenseFileContent.length > 0) {
    resolvedLicenses.push({
      hash: "LICENSE",
      name: "License",
      url: "",
      spdxId: "",
      content: licenseFileContent,
    });
  }

  const lib: LibraryEntry = {
    uniqueId: name,
    artifactVersion: version,
    name: name,
    description: description,
    website: homepage,
    developers: authorName ? [{ name: authorName, organisationUrl: "" }] : [],
    scm: repoUrl ? { connection: "", developerConnection: "", url: repoUrl } : null,
    organization: null,
    funding: [],
    tag: "",
    licenses: resolvedLicenses.map((l) => l.hash),
  };

  return { lib, licenses: resolvedLicenses };
}

/** Read and parse an oh-package.json5 file; returns null on failure. */
function readOhPackage(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return parseJson5(text);
  } catch {
    return null;
  }
}

/** Options for scanProject. */
export interface ScanOptions {
  /** Module names to skip (host-project local modules). */
  selfModules?: Set<string>;
}

/**
 * Read a single package directory, resolve its metadata, and accumulate.
 * Skips symlinks pointing to project-local modules and already-collected ids.
 */
function collectPackage(
  pkgDir: string,
  fallbackName: string,
  licensesMap: Record<string, LicenseEntry>,
  libsMap: Record<string, LibraryEntry>,
  selfModules: Set<string>,
): void {
  const pkgJsonPath = path.join(pkgDir, "oh-package.json5");
  const pkg = readOhPackage(pkgJsonPath);
  if (!pkg) {
    return;
  }

  const pkgName = getStr(pkg, "name", fallbackName);

  if (selfModules.has(pkgName)) {
    return;
  }
  if (libsMap[pkgName]) {
    return;
  }

  const { lib, licenses } = buildLibrary(pkg, pkgDir);
  libsMap[lib.uniqueId] = lib;
  for (const lic of licenses) {
    if (!licensesMap[lic.hash]) {
      licensesMap[lic.hash] = lic;
    }
  }
}

/** Scan a single oh_modules directory and collect package info. */
function scanOhModulesDir(
  ohModulesDir: string,
  licensesMap: Record<string, LicenseEntry>,
  libsMap: Record<string, LibraryEntry>,
  selfModules: Set<string>,
): void {
  if (!fs.existsSync(ohModulesDir)) {
    return;
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(ohModulesDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }
    const name = entry.name;
    if (name === ".ohpm" || name.startsWith(".")) {
      continue;
    }

    // Scoped package (e.g. @ohos) — descend one level.
    if (name.startsWith("@")) {
      const scopedDir = path.join(ohModulesDir, name);
      let scopedEntries: fs.Dirent[] = [];
      try {
        scopedEntries = fs.readdirSync(scopedDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sub of scopedEntries) {
        if (!sub.isDirectory() && !sub.isSymbolicLink()) {
          continue;
        }
        const pkgDir = path.join(scopedDir, sub.name);
        const fullName = `${name}/${sub.name}`;
        collectPackage(pkgDir, fullName, licensesMap, libsMap, selfModules);
      }
      continue;
    }

    const pkgDir = path.join(ohModulesDir, name);
    collectPackage(pkgDir, name, licensesMap, libsMap, selfModules);
  }
}

/**
 * Scan the project at projectRoot for OHPM dependencies and produce
 * OSSLibraries data.
 *
 * Looks at:
 *   - <projectRoot>/oh_modules
 *   - <projectRoot>/<module>/oh_modules (for every module dir)
 */
export function scanProject(projectRoot: string, options?: ScanOptions): ScanResult {
  // Start from the defaults and extend with any caller-provided modules so
  // the host-project modules are never accidentally included.
  const selfModules = new Set<string>(DEFAULT_SELF_MODULES);
  for (const name of options?.selfModules ?? []) {
    selfModules.add(name);
  }
  const licensesMap: Record<string, LicenseEntry> = {};
  const libsMap: Record<string, LibraryEntry> = {};

  scanOhModulesDir(path.join(projectRoot, "oh_modules"), licensesMap, libsMap, selfModules);

  let rootEntries: fs.Dirent[] = [];
  try {
    rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    rootEntries = [];
  }
  for (const entry of rootEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === "oh_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const modOhModules = path.join(projectRoot, entry.name, "oh_modules");
    if (fs.existsSync(modOhModules)) {
      scanOhModulesDir(modOhModules, licensesMap, libsMap, selfModules);
    }
  }

  const libraries = Object.keys(libsMap).map((k) => libsMap[k]);
  libraries.sort((a, b) => {
    const an = (a.name || "").toLowerCase();
    const bn = (b.name || "").toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  return { libraries, licenses: licensesMap };
}

/** Serialize the scan result to OSSLibraries JSON. */
export function serializeResult(result: ScanResult): string {
  const out = {
    libraries: result.libraries,
    licenses: result.licenses,
  };
  return JSON.stringify(out, null, 2);
}
