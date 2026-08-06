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
 * Shared types for the OSSLibraries scanner.
 *
 * The two entry records (`LibraryEntry`, `LicenseEntry`) mirror the JSON shape
 * consumed by the OSSLibraries Parser at runtime:
 * {
 *   "libraries": [ { ..., "licenses": ["hash1"] } ],
 *   "licenses":  { "hash1": { "hash": "...", "name": "...", "content": "..." } }
 * }
 */

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

/** Options for scanProject. */
export interface ScanOptions {
  /** Module names to skip (host-project local modules). */
  selfModules?: Set<string>;
}

/**
 * Normalized view of a package's oh-package.json5 metadata.
 *
 * The raw JSON5 file is loosely typed (author/repository/license each accept
 * several shapes), so the scanner converts it once into this strict shape and
 * works with the result everywhere else.
 */
export interface OhPackage {
  name: string;
  version: string;
  description: string;
  homepage: string;
  authorName: string;
  /** URL extracted from the author object (e.g. { name, url }). */
  authorUrl: string;
  repoUrl: string;
  /** Raw license declarations, e.g. "Apache-2.0" or "Apache-2.0 OR MIT". */
  licenseDecls: string[];
  /** Keywords from the manifest, joined as a comma-separated tag. */
  keywords: string[];
}
