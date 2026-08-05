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
 * OHPM dependency scanner.
 *
 * Discovers every oh-package.json5 under a project's oh_modules directories
 * (via fast-glob), assembles one `LibraryEntry` per dependency, deduplicates
 * by name+version so multiple versions appear side by side, prefers the
 * LICENSE file bundled in each HAR package for the full license text, and
 * emits the OSSLibraries JSON consumed by the OSSLibraries UI library.
 */

import * as fs from "fs";
import * as path from "path";
import fg from "fast-glob";
import semver from "semver";
import { readOhPackage } from "./ohpm.js";
import { contentHash, resolveLicense } from "./spdx.js";
import type { LibraryEntry, LicenseEntry, OhPackage, ScanOptions, ScanResult } from "./types.js";

/**
 * Module names that belong to the host project and must NOT appear in the
 * generated license list. Callers may extend this via scanProject options.
 */
const DEFAULT_SELF_MODULES = new Set<string>(["entry"]);

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

/** Find every oh-package.json5 inside the project's oh_modules directories. */
function findOhPackages(projectRoot: string): string[] {
  return fg.sync(["**/oh_modules/*/oh-package.json5", "**/oh_modules/@*/*/oh-package.json5"], {
    cwd: projectRoot,
    onlyFiles: true,
  });
}

/** Derive the package name from its relative path: "@scope/bar" or "foo". */
function packageNameFromPath(relativePath: string): string {
  // fast-glob always returns POSIX-style paths regardless of platform, so
  // split on "/" rather than path.sep (which would be "\\" on Windows and
  // fail to segment the glob result).
  const parts = relativePath.split("/");
  const idx = parts.indexOf("oh_modules");
  const next = parts[idx + 1];
  if (next?.startsWith("@")) {
    return `${next}/${parts[idx + 2] ?? ""}`;
  }
  return next ?? "";
}

/**
 * Read the LICENSE file bundled inside a package directory.
 *
 * OHPM-downloaded HAR packages ship their own LICENSE file, which is the
 * authoritative full license text. Returns the contents of the first matching
 * candidate, or "" when none is present.
 */
function readLicenseFile(pkgDir: string): string {
  const actualByName: Record<string, string> = {};
  try {
    for (const entry of fs.readdirSync(pkgDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        actualByName[entry.name.toUpperCase()] = entry.name;
      }
    }
  } catch {
    return "";
  }

  for (const candidate of LICENSE_FILE_NAMES) {
    const actual = actualByName[candidate.toUpperCase()];
    if (actual) {
      try {
        return fs.readFileSync(path.join(pkgDir, actual), "utf-8");
      } catch {
        // Continue to the next candidate.
      }
    }
  }
  return "";
}

/**
 * Build a library entry from a normalized oh-package manifest.
 *
 * License text is taken from the bundled LICENSE file when available, and
 * otherwise filled from the canonical SPDX text in spdx-license-list.
 */
export function buildLibrary(
  pkg: OhPackage,
  pkgDir: string,
): { lib: LibraryEntry; licenses: LicenseEntry[] } {
  const licenseFile = readLicenseFile(pkgDir);

  const resolved = pkg.licenseDecls
    .flatMap((decl) => resolveLicense(decl))
    .map((lic) =>
      licenseFile ? { ...lic, content: licenseFile, hash: contentHash(licenseFile) } : lic,
    );

  // No license declared, but a LICENSE file exists — still surface the text.
  if (resolved.length === 0 && licenseFile) {
    resolved.push({
      hash: contentHash(licenseFile),
      name: "License",
      url: "",
      spdxId: "",
      content: licenseFile,
    });
  }

  const lib: LibraryEntry = {
    uniqueId: pkg.name,
    artifactVersion: pkg.version,
    name: pkg.name,
    description: pkg.description,
    website: pkg.homepage,
    developers: pkg.authorName ? [{ name: pkg.authorName, organisationUrl: "" }] : [],
    scm: pkg.repoUrl ? { connection: "", developerConnection: "", url: pkg.repoUrl } : null,
    organization: null,
    funding: [],
    tag: "",
    licenses: [...new Set(resolved.map((l) => l.hash))],
  };

  return { lib, licenses: resolved };
}

/**
 * Scan the project at projectRoot for OHPM dependencies and produce
 * OSSLibraries data.
 *
 * Every version of a dependency is listed as its own entry, sorted by name
 * then semver. Duplicate name@version occurrences (e.g. the same package
 * installed into several modules) are collected once.
 */
export function scanProject(projectRoot: string, options?: ScanOptions): ScanResult {
  // Start from the defaults and extend with any caller-provided modules so
  // the host-project modules are never accidentally included.
  const selfModules = new Set(DEFAULT_SELF_MODULES);
  for (const name of options?.selfModules ?? []) {
    selfModules.add(name);
  }

  const built: { lib: LibraryEntry; licenses: LicenseEntry[] }[] = [];
  for (const relativePath of findOhPackages(projectRoot)) {
    const pkgDir = path.dirname(path.resolve(projectRoot, relativePath));
    const pkg = readOhPackage(
      path.join(pkgDir, "oh-package.json5"),
      packageNameFromPath(relativePath),
    );
    if (!pkg || selfModules.has(pkg.name)) {
      continue;
    }
    built.push(buildLibrary(pkg, pkgDir));
  }

  // First occurrence wins for duplicate name@version across modules.
  const uniqueLibs = new Map<string, LibraryEntry>();
  for (const { lib } of built) {
    const key = `${lib.name}@${lib.artifactVersion}`;
    if (!uniqueLibs.has(key)) {
      uniqueLibs.set(key, lib);
    }
  }

  // Licenses are deduplicated by content hash, so identical texts collapse
  // into a single shared entry.
  const licenses: Record<string, LicenseEntry> = {};
  for (const { licenses: libLicenses } of built) {
    for (const lic of libLicenses) {
      licenses[lic.hash] ??= lic;
    }
  }

  return {
    libraries: [...uniqueLibs.values()].sort(compareLibraries),
    licenses,
  };
}

/** Compare versions with semver when both are valid, string compare otherwise. */
function compareVersions(a: string, b: string): number {
  const va = semver.valid(a);
  const vb = semver.valid(b);
  return va && vb ? semver.compare(va, vb) : a.localeCompare(b);
}

/** Sort libraries by name, then by version. */
function compareLibraries(a: LibraryEntry, b: LibraryEntry): number {
  const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  return byName !== 0 ? byName : compareVersions(a.artifactVersion, b.artifactVersion);
}

/** Serialize the scan result to OSSLibraries JSON. */
export function serializeResult(result: ScanResult): string {
  return JSON.stringify({ libraries: result.libraries, licenses: result.licenses });
}
