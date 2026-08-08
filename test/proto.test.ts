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

import { beforeEach, describe, expect, it } from "vite-plus/test";
import { deserializeProto, serializeProto, __resetProtoCache } from "../src/proto.js";
import type { LicenseEntry, ScanResult } from "../src/types.js";

/** Build a ScanResult exercising the shapes that risk lossy encoding. */
function sampleResult(): ScanResult {
  return {
    libraries: [
      {
        uniqueId: "foo",
        artifactVersion: "1.0.0",
        name: "foo",
        description: "A test library",
        website: "https://example.com",
        developers: [{ name: "Alice", organisationUrl: "https://alice.dev" }],
        scm: {
          connection: "git://x/foo",
          developerConnection: "",
          url: "https://github.com/x/foo",
        },
        organization: null,
        funding: [],
        tag: ["oss", "license"],
        licenses: ["hash-mit"],
      },
      {
        // Minimal library with no scm / developers — exercises null-message
        // omission and empty repeated fields.
        uniqueId: "bar",
        artifactVersion: "2.1.0",
        name: "bar",
        description: "",
        website: "",
        developers: [],
        scm: null,
        organization: null,
        funding: [],
        tag: [],
        licenses: ["hash-mit", "hash-apache"],
      },
    ],
    licenses: {
      "hash-mit": {
        hash: "hash-mit",
        name: "MIT License",
        url: "https://opensource.org/licenses/MIT",
        spdxId: "MIT",
        content: "MIT LICENSE TEXT",
      },
      "hash-apache": {
        hash: "hash-apache",
        name: "Apache License 2.0",
        url: "https://www.apache.org/licenses/LICENSE-2.0",
        spdxId: "Apache-2.0",
        content: "APACHE LICENSE TEXT",
      },
    },
  };
}

beforeEach(() => {
  // Each test parses the schema fresh so a failure in one test cannot poison
  // the cached reflected type for the others.
  __resetProtoCache();
});

describe("serializeProto / deserializeProto", () => {
  it("round-trips every scalar and structural field", () => {
    const original = sampleResult();
    const { binary } = serializeProto(original);
    const decoded = deserializeProto(binary) as {
      libraries: Array<Record<string, unknown>>;
      licenses: Record<string, Record<string, unknown>>;
    };

    expect(decoded.libraries).toHaveLength(2);

    const foo = decoded.libraries.find((l) => l.name === "foo")!;
    expect(foo.uniqueId).toBe("foo");
    expect(foo.artifactVersion).toBe("1.0.0");
    expect(foo.description).toBe("A test library");
    expect(foo.website).toBe("https://example.com");
    expect(foo.tag).toEqual(["oss", "license"]);
    expect(foo.licenses).toEqual(["hash-mit"]);

    const developers = foo.developers as Array<Record<string, string>>;
    expect(developers[0]!.name).toBe("Alice");
    expect(developers[0]!.organisationUrl).toBe("https://alice.dev");

    const scm = foo.scm as Record<string, string> | null;
    // proto3 defaults: an unset sub-message decodes to an empty object, not
    // null. What matters is that the connection/url data survives.
    expect(scm).not.toBeNull();
    expect(scm!.connection).toBe("git://x/foo");
    expect(scm!.url).toBe("https://github.com/x/foo");

    // Free-form fields are carried as JSON strings and recover their original
    // value via JSON.parse — lossless across the proto round-trip.
    expect(JSON.parse(foo.organization as string)).toBeNull();
    expect(JSON.parse(foo.funding as string)).toEqual([]);
  });

  it("preserves the licenses map keyed by hash", () => {
    const { binary } = serializeProto(sampleResult());
    const decoded = deserializeProto(binary) as {
      licenses: Record<string, Record<string, unknown>>;
    };

    expect(Object.keys(decoded.licenses).sort()).toEqual(["hash-apache", "hash-mit"]);
    expect(decoded.licenses["hash-mit"]!.name).toBe("MIT License");
    expect(decoded.licenses["hash-mit"]!.spdxId).toBe("MIT");
    expect(decoded.licenses["hash-mit"]!.content).toBe("MIT LICENSE TEXT");
    expect(decoded.licenses["hash-apache"]!.spdxId).toBe("Apache-2.0");
  });

  it("produces a non-empty, parseable schema string", () => {
    const { schema } = serializeProto(sampleResult());
    expect(schema).toContain('syntax = "proto3"');
    expect(schema).toContain("package osslibraries");
    expect(schema).toContain("message ScanResult");
    expect(schema).toContain("message LibraryEntry");
    expect(schema).toContain("message LicenseEntry");
  });

  it("is idempotent: decoding then re-encoding yields the same bytes", () => {
    const original = sampleResult();
    const { binary: first } = serializeProto(original);
    const decoded = deserializeProto(first) as {
      libraries: Array<Record<string, unknown>>;
      licenses: Record<string, Record<string, unknown>>;
    };

    // Reconstruct a ScanResult from the proto-decoded object: undo the
    // JSON-string encoding of organization/funding and normalize the proto3
    // empty-scm object back to null. This is the same conversion the runtime
    // consumer would perform.
    const reconstructed: ScanResult = {
      libraries: decoded.libraries.map((lib) => {
        const scm = lib.scm as Record<string, string> | null;
        const hasScm = scm && (scm.connection || scm.developerConnection || scm.url);
        return {
          uniqueId: lib.uniqueId as string,
          artifactVersion: lib.artifactVersion as string,
          name: lib.name as string,
          description: lib.description as string,
          website: lib.website as string,
          developers: (lib.developers as Array<Record<string, string>>).map((d) => ({
            name: d.name,
            organisationUrl: d.organisationUrl,
          })),
          scm: hasScm
            ? {
                connection: scm!.connection,
                developerConnection: scm!.developerConnection,
                url: scm!.url,
              }
            : null,
          organization: JSON.parse(lib.organization as string),
          funding: JSON.parse(lib.funding as string),
          tag: lib.tag as string[],
          licenses: lib.licenses as string[],
        };
      }),
      licenses: decoded.licenses as unknown as Record<string, LicenseEntry>,
    };

    const { binary: second } = serializeProto(reconstructed);
    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
  });

  it("handles an empty scan result without error", () => {
    const empty: ScanResult = { libraries: [], licenses: {} };
    const { binary } = serializeProto(empty);
    const decoded = deserializeProto(binary) as {
      libraries: unknown[];
      licenses: Record<string, unknown>;
    };
    expect(decoded.libraries).toEqual([]);
    expect(decoded.licenses).toEqual({});
  });

  it("preserves multi-license references on a single library", () => {
    const { binary } = serializeProto(sampleResult());
    const decoded = deserializeProto(binary) as {
      libraries: Array<Record<string, unknown>>;
    };
    const bar = decoded.libraries.find((l) => l.name === "bar")!;
    expect((bar.licenses as string[]).sort()).toEqual(["hash-apache", "hash-mit"]);
  });

  it("normalizes undefined organization/funding to canonical empty values", () => {
    // A caller violating the type with undefined must not silently drop the
    // field via JSON.stringify(undefined) === undefined. organization falls
    // back to null, funding to [] — matching the scanner's own conventions.
    const result: ScanResult = {
      libraries: [
        {
          uniqueId: "u",
          artifactVersion: "1.0.0",
          name: "u",
          description: "",
          website: "",
          developers: [],
          scm: null,
          organization: undefined as unknown as null,
          funding: undefined as unknown as [],
          tag: [],
          licenses: [],
        },
      ],
      licenses: {},
    };
    const { binary } = serializeProto(result);
    const decoded = deserializeProto(binary) as {
      libraries: Array<Record<string, unknown>>;
    };
    const lib = decoded.libraries[0]!;
    expect(JSON.parse(lib.organization as string)).toBeNull();
    expect(JSON.parse(lib.funding as string)).toEqual([]);
  });
});
