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
 * SPDX license resolution.
 *
 * Turns a license declaration from oh-package.json5 into one or more
 * `LicenseEntry` objects using `spdx-expression-parse` (proper AST parsing of
 * OR/AND/WITH expressions), `spdx-correct` (fixes common misspellings such as
 * "apache2" -> "Apache-2.0"), and `spdx-license-list` (canonical name, URL and
 * full license text). This module is pure — no filesystem access.
 */

import { createHash } from "crypto";
import correct from "spdx-correct";
import spdxList from "spdx-license-list";
import spdxFull from "spdx-license-list/full";
import parseExpression from "spdx-expression-parse";
import type { LicenseEntry } from "./types.js";

/**
 * Compute a stable identifier for license text.
 *
 * The full SHA-256 digest is used because the hash acts as the map key for
 * downstream consumers — truncating it could silently merge distinct license
 * variants. Packages shipping identical license text resolve to a single
 * shared entry, while packages with different text (e.g. different
 * attribution lines) get distinct entries.
 */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Collect every license id from a parsed SPDX expression AST.
 *
 * - Simple license: `{ license: "MIT" }` → `["MIT"]`
 * - WITH exception: `{ license: "GPL-2.0-only", exception: "Classpath-exception-2.0" }`
 *   → `["GPL-2.0-only", "Classpath-exception-2.0"]`
 * - Conjunction: `{ conjunction: "or", left, right }` → left ids ++ right ids
 */
function collectLicenseIds(node: ReturnType<typeof parseExpression>): string[] {
  if ("license" in node) {
    return node.exception ? [node.license, node.exception] : [node.license];
  }
  return [...collectLicenseIds(node.left), ...collectLicenseIds(node.right)];
}

/**
 * Build a LicenseEntry for a known SPDX id, pulling the canonical name, URL
 * and full license text from spdx-license-list. Unknown ids (e.g. WITH
 * exceptions, which the license list does not carry) degrade to a minimal
 * entry named after the id.
 */
function licenseEntryFor(id: string): LicenseEntry {
  const meta = spdxList[id];
  const full = spdxFull[id];
  return {
    hash: id,
    name: meta?.name ?? full?.name ?? id,
    url: meta?.url ?? full?.url ?? "",
    spdxId: id,
    content: full?.licenseText ?? "",
  };
}

/**
 * Resolve a license declaration string to license entries.
 *
 * A declaration may be:
 *  - a single SPDX id ("Apache-2.0")
 *  - an SPDX expression ("Apache-2.0 OR MIT") — parsed via spdx-expression-parse
 *  - a free-form license name (corrected via spdx-correct, looked up in spdx-license-list)
 *
 * Returns one entry per license in the expression. Full license text is filled
 * from `spdx-license-list/full` when available and overridden later by the
 * LICENSE file bundled in the HAR package.
 */
export function resolveLicense(declaration: string): LicenseEntry[] {
  if (typeof declaration !== "string") {
    return [];
  }
  const trimmed = declaration.trim();
  if (!trimmed) {
    return [];
  }

  // Valid SPDX expression first — handles OR/AND/WITH correctly. Each token
  // is run through spdx-correct so minor misspellings (e.g. lowercase "mit")
  // inside a valid expression are still normalized without losing the
  // expression structure.
  try {
    return collectLicenseIds(parseExpression(trimmed)).map((id) => {
      const corrected = correct(id) ?? id;
      return licenseEntryFor(corrected);
    });
  } catch {
    // Not a valid SPDX expression — fall through.
  }

  // Fallback: correct common misspellings of a single license name.
  const corrected = correct(trimmed);
  if (corrected) {
    return [licenseEntryFor(corrected)];
  }

  // Unknown license — keep a minimal entry named after the declaration.
  return [{ hash: trimmed, name: trimmed, url: "", spdxId: "", content: "" }];
}
