/**
 * Copyright (c) 2026 composable-tu
 * OSSLibraries Hvigor Plugin is licensed under Mulan PSL v2.
 * You may obtain a copy of Mulan PSL v2 at:
 *          http://license.coscl.org.cn/MulanPSL2
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
 * EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
 * MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
 * See the Mulan PSL v2 for more details.
 */

import { decode } from "@msgpack/msgpack";
import { describe, expect, it } from "vite-plus/test";
import { getSerializer } from "../src/format.js";
import { serializeResult } from "../src/scanner.js";
import type { ScanResult } from "../src/types.js";

const sample: ScanResult = {
  libraries: [
    {
      uniqueId: "foo",
      artifactVersion: "1.0.0",
      name: "foo",
      description: "a dependency",
      website: "https://example.com",
      developers: [{ name: "Alice", organisationUrl: "" }],
      scm: null,
      organization: null,
      funding: [],
      tag: ["oss"],
      licenses: ["hash1"],
    },
  ],
  licenses: {
    hash1: { hash: "hash1", name: "MIT", url: "", spdxId: "MIT", content: "MIT TEXT" },
  },
};

describe("getSerializer", () => {
  it("JSON serializer matches serializeResult and reports its extension/name", () => {
    const serializer = getSerializer("json");
    expect(serializer.extension).toBe("json");
    expect(serializer.name).toBe("JSON");
    expect(serializer.encode(sample).toString("utf-8")).toBe(serializeResult(sample));
  });

  it("MessagePack serializer round-trips back to the same object", () => {
    const serializer = getSerializer("message-pack");
    expect(serializer.extension).toBe("msgpack");
    expect(serializer.name).toBe("MessagePack");

    const bytes = serializer.encode(sample);
    expect(Buffer.isBuffer(bytes)).toBe(true);

    const decoded = decode(bytes) as { libraries: unknown[]; licenses: Record<string, unknown> };
    expect(decoded.libraries).toHaveLength(1);
    expect(decoded.libraries[0]).toMatchObject({ name: "foo", artifactVersion: "1.0.0" });
    expect(decoded.licenses).toHaveProperty("hash1");
  });

  it("JSON and MessagePack carry the same logical content", () => {
    const fromJson = JSON.parse(getSerializer("json").encode(sample).toString("utf-8"));
    const fromMsgpack = decode(getSerializer("message-pack").encode(sample));
    expect(fromMsgpack).toEqual(fromJson);
  });
});
