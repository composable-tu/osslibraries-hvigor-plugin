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

import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { parseOhPackage } from "../src/ohpm.js";
import { scanProject, serializeResult } from "../src/scanner.js";

function writePkg(root: string, relPath: string, content: string | object): void {
  const abs = join(root, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, typeof content === "string" ? content : JSON.stringify(content));
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ossl-test-"));
});

describe("parseOhPackage", () => {
  it("normalizes loosely-typed fields", () => {
    const pkg = parseOhPackage({
      name: "foo",
      version: "1.0.0",
      author: { name: "Alice", email: "a@b.c", url: "https://alice.dev" },
      repository: { url: "https://github.com/x/foo" },
      license: ["MIT", "Apache-2.0"],
      keywords: ["oss", "license"],
    });
    expect(pkg.authorName).toBe("Alice");
    expect(pkg.authorUrl).toBe("https://alice.dev");
    expect(pkg.repoUrl).toBe("https://github.com/x/foo");
    expect(pkg.licenseDecls).toEqual(["MIT", "Apache-2.0"]);
    expect(pkg.keywords).toEqual(["oss", "license"]);
  });

  it("handles string-only author (no url)", () => {
    const pkg = parseOhPackage({
      name: "bar",
      version: "1.0.0",
      author: "composable-tu",
    });
    expect(pkg.authorName).toBe("composable-tu");
    expect(pkg.authorUrl).toBe("");
  });

  it("handles author object without url", () => {
    const pkg = parseOhPackage({
      name: "baz",
      version: "1.0.0",
      author: { name: "Alice" },
    });
    expect(pkg.authorName).toBe("Alice");
    expect(pkg.authorUrl).toBe("");
  });
});

describe("scanProject", () => {
  it("lists every version of a dependency side by side", () => {
    writePkg(root, "oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "1.0.0",
      license: "MIT",
    });
    writePkg(root, "entry/oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "2.0.0",
      license: "MIT",
    });

    const { libraries } = scanProject(root);
    const foo = libraries.filter((l) => l.name === "foo");
    expect(foo.map((l) => l.artifactVersion)).toEqual(["1.0.0", "2.0.0"]);
  });

  it("keeps distinct licenses for different versions of the same package", () => {
    // Same package name, different versions, different bundled LICENSE text.
    // Both versions must be kept AND each must surface its own license text.
    writePkg(root, "oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "1.0.0",
      license: "MIT",
    });
    writePkg(root, "oh_modules/foo/LICENSE", "VERSION ONE LICENSE");
    writePkg(root, "entry/oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "2.0.0",
      license: "MIT",
    });
    writePkg(root, "entry/oh_modules/foo/LICENSE", "VERSION TWO LICENSE");

    const { libraries, licenses } = scanProject(root);
    const foo = libraries.filter((l) => l.name === "foo");
    expect(foo.map((l) => l.artifactVersion)).toEqual(["1.0.0", "2.0.0"]);

    const v1 = foo.find((l) => l.artifactVersion === "1.0.0")!;
    const v2 = foo.find((l) => l.artifactVersion === "2.0.0")!;
    expect(v1.licenses).toHaveLength(1);
    expect(v2.licenses).toHaveLength(1);
    expect(v1.licenses[0]).not.toBe(v2.licenses[0]);

    expect(licenses[v1.licenses[0]].content).toBe("VERSION ONE LICENSE");
    expect(licenses[v2.licenses[0]].content).toBe("VERSION TWO LICENSE");
  });

  it("deduplicates identical name@version", () => {
    writePkg(root, "oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "1.0.0",
      license: "MIT",
    });
    writePkg(root, "entry/oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "1.0.0",
      license: "MIT",
    });

    const { libraries } = scanProject(root);
    expect(libraries.filter((l) => l.name === "foo")).toHaveLength(1);
  });

  it("does not emit licenses from dropped duplicate name@version", () => {
    // Two occurrences of foo@1.0.0, each bundling a different LICENSE file.
    // The first occurrence wins in uniqueLibs; the second one's license
    // hash must NOT leak into the licenses map.
    writePkg(root, "oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "1.0.0",
      license: "MIT",
    });
    writePkg(root, "oh_modules/foo/LICENSE", "FIRST LICENSE TEXT");
    writePkg(root, "entry/oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "1.0.0",
      license: "MIT",
    });
    writePkg(root, "entry/oh_modules/foo/LICENSE", "SECOND LICENSE TEXT");

    const { libraries, licenses } = scanProject(root);
    const foo = libraries.find((l) => l.name === "foo")!;
    expect(foo.licenses).toHaveLength(1);

    const referencedHash = foo.licenses[0];
    expect(licenses[referencedHash].content).toBe("FIRST LICENSE TEXT");

    // No stale entry for the dropped duplicate's license text.
    const allHashes = Object.keys(licenses);
    expect(allHashes).toHaveLength(1);
    expect(allHashes[0]).toBe(referencedHash);
  });

  it("prefers the bundled LICENSE file and hashes its text", () => {
    writePkg(root, "oh_modules/baz/oh-package.json5", {
      name: "baz",
      version: "1.2.3",
      license: "MIT",
    });
    writePkg(root, "oh_modules/baz/LICENSE", "CUSTOM LICENSE TEXT");

    const { libraries, licenses } = scanProject(root);
    const baz = libraries.find((l) => l.name === "baz")!;
    expect(baz.licenses[0]).not.toBe("MIT");
    expect(licenses[baz.licenses[0]].content).toBe("CUSTOM LICENSE TEXT");
  });

  it("synthesizes a License entry when no license field is declared", () => {
    writePkg(root, "oh_modules/qux/oh-package.json5", {
      name: "qux",
      version: "1.0.0",
    });
    writePkg(root, "oh_modules/qux/LICENSE", "CUSTOM LICENSE TEXT");

    const { libraries, licenses } = scanProject(root);
    const qux = libraries.find((l) => l.name === "qux")!;
    expect(qux.licenses).toHaveLength(1);

    const licenseEntry = licenses[qux.licenses[0]];
    expect(licenseEntry.name).toBe("License");
    expect(licenseEntry.content).toBe("CUSTOM LICENSE TEXT");
    expect(licenseEntry.hash).toBeTruthy();
  });

  it("excludes host-project modules via selfModules", () => {
    writePkg(root, "oh_modules/entry/oh-package.json5", {
      name: "entry",
      version: "1.0.0",
      license: "MIT",
    });
    writePkg(root, "oh_modules/lib/oh-package.json5", {
      name: "lib",
      version: "1.0.0",
      license: "MIT",
    });

    const { libraries } = scanProject(root, { selfModules: new Set(["entry"]) });
    expect(libraries.map((l) => l.name)).not.toContain("entry");
    expect(libraries.map((l) => l.name)).toContain("lib");
  });

  it("handles scoped packages", () => {
    writePkg(root, "oh_modules/@scope/bar/oh-package.json5", {
      name: "@scope/bar",
      version: "0.3.1",
      license: "MIT",
    });

    const { libraries } = scanProject(root);
    expect(libraries.map((l) => l.name)).toEqual(["@scope/bar"]);
  });

  it("serializes into the OSSLibraries JSON shape", () => {
    writePkg(root, "oh_modules/foo/oh-package.json5", {
      name: "foo",
      version: "1.0.0",
      license: "MIT",
    });

    const json = JSON.parse(serializeResult(scanProject(root)));

    // Top-level shape
    expect(Object.keys(json).sort()).toEqual(["libraries", "licenses"]);
    expect(Array.isArray(json.libraries)).toBe(true);
    expect(json.libraries).toHaveLength(1);
    expect(typeof json.licenses).toBe("object");

    const [library] = json.libraries;
    expect(library).toBeDefined();

    // libraries[0].licenses is an array of hash strings
    expect(Array.isArray(library.licenses)).toBe(true);
    expect(library.licenses.length).toBeGreaterThan(0);

    for (const hash of library.licenses) {
      // Each hash is a string
      expect(typeof hash).toBe("string");

      // Each hash exists in the licenses map
      expect(json.licenses).toHaveProperty(hash);

      const license = json.licenses[hash];

      // Each license object has the expected fields
      expect(license).toEqual(
        expect.objectContaining({
          hash,
          name: expect.any(String),
          content: expect.any(String),
        }),
      );
    }
  });
});
