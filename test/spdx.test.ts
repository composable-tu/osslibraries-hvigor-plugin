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

import { describe, expect, it } from "vite-plus/test";
import { contentHash, resolveLicense } from "../src/spdx.js";

describe("contentHash", () => {
  it("is stable for identical text", () => {
    expect(contentHash("MIT License")).toBe(contentHash("MIT License"));
  });

  it("differs for distinct text", () => {
    expect(contentHash("MIT License")).not.toBe(contentHash("Apache License"));
  });
});

describe("resolveLicense", () => {
  it("resolves a single SPDX id with canonical metadata and text", () => {
    const [lic] = resolveLicense("MIT");
    expect(lic.hash).toBe("MIT");
    expect(lic.spdxId).toBe("MIT");
    expect(lic.name).toContain("MIT");
    expect(lic.content.length).toBeGreaterThan(0);
  });

  it("lists every license in an OR expression", () => {
    const licenses = resolveLicense("Apache-2.0 OR MIT");
    expect(licenses.map((l) => l.spdxId).sort()).toEqual(["Apache-2.0", "MIT"]);
  });

  it("lists every license in an AND expression", () => {
    const licenses = resolveLicense("MIT AND ISC");
    expect(licenses.map((l) => l.spdxId).sort()).toEqual(["ISC", "MIT"]);
  });

  it("handles a WITH exception", () => {
    const licenses = resolveLicense("GPL-2.0-only WITH Classpath-exception-2.0");
    expect(licenses.map((l) => l.spdxId)).toContain("GPL-2.0-only");
    expect(licenses.map((l) => l.spdxId)).toContain("Classpath-exception-2.0");
  });

  it("preserves WITH exceptions that spdx-correct does not recognize", () => {
    // spdx-correct returns null for SPDX exception ids (e.g.
    // Classpath-exception-2.0); the resolver must fall back to the original
    // token rather than dropping it.
    const licenses = resolveLicense("GPL-2.0-only WITH Classpath-exception-2.0");
    expect(licenses.map((l) => l.spdxId)).toEqual(["GPL-2.0-only", "Classpath-exception-2.0"]);
  });

  it("corrects common misspellings via spdx-correct", () => {
    expect(resolveLicense("apache2").map((l) => l.spdxId)).toEqual(["Apache-2.0"]);
  });

  it("falls back to spdx-correct for malformed SPDX expressions", () => {
    // "MIT OR" is not a valid SPDX expression (parseExpression throws on the
    // dangling operator), but spdx-correct can still recover "MIT" from it.
    const [lic] = resolveLicense("MIT OR");
    expect(lic.spdxId).toBe("MIT");
    expect(lic.hash).toBe("MIT");
  });

  it("returns an empty array for non-string declarations", () => {
    expect(resolveLicense(undefined as any)).toEqual([]);
    expect(resolveLicense(null as any)).toEqual([]);
  });

  it("keeps a minimal entry for unknown declarations", () => {
    const [lic] = resolveLicense("Custom Proprietary License");
    expect(lic.spdxId).toBe("");
    expect(lic.name).toBe("Custom Proprietary License");
  });

  it("returns an empty list for empty input", () => {
    expect(resolveLicense("")).toEqual([]);
    expect(resolveLicense("   ")).toEqual([]);
  });
});
