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
 * Protobuf serialization for the OSSLibraries scan result.
 *
 * The `.proto` schema below is the single source of truth for the wire format:
 * it is parsed at runtime by `protobufjs` to obtain a reflected message `Type`,
 * AND it is emitted verbatim alongside the binary payload so the runtime-side
 * parser (e.g. `@ohos/protobufjs`) can load it with `protobuf.load(...)`.
 *
 * The message shapes mirror {@link ScanResult} field-for-field:
 *   - `LibraryEntry.licenses`  → repeated string  (hashes, as in JSON)
 *   - `ScanResult.licenses`    → map<string, LicenseEntry>  (mirrors the JSON
 *     record, so no semantic information is lost across formats)
 *
 * `organization` / `funding` are free-form (`unknown`) in the JSON model and
 * are carried here as JSON strings, keeping the schema self-contained (no
 * google/protobuf/struct.proto import) while remaining lossless: the runtime
 * side recovers the original value with `JSON.parse`.
 */

import protobuf from "protobufjs";
import type { ScanResult } from "./types.js";

/**
 * The `.proto` schema, embedded as a string so it is:
 *  1. parsed once by `protobufjs` to build the reflected message types, and
 *  2. written verbatim to `osslibraries.proto` for the runtime parser.
 *
 * Keep field numbers stable — they ARE the wire-format contract. New fields
 * must be appended; never reuse or renumber existing ones.
 */
export const OSSLIBRARIES_PROTO_SCHEMA = `syntax = "proto3";

package osslibraries;

// A single resolved license. \`hash\` is the content hash used as the map key
// and referenced by LibraryEntry.licenses.
message LicenseEntry {
  string hash = 1;
  string name = 2;
  string url = 3;
  string spdx_id = 4;
  string content = 5;
}

message Developer {
  string name = 1;
  string organisation_url = 2;
}

message Scm {
  string connection = 1;
  string developer_connection = 2;
  string url = 3;
}

// One discovered dependency. \`licenses\` holds content hashes that resolve
// through ScanResult.licenses.
message LibraryEntry {
  string unique_id = 1;
  string artifact_version = 2;
  string name = 3;
  string description = 4;
  string website = 5;
  repeated Developer developers = 6;
  Scm scm = 7;
  // Free-form JSON values carried verbatim as a JSON string, so the schema
  // stays self-contained (no google/protobuf/struct.proto import) and any
  // shape round-trips losslessly. Decode with JSON.parse on the runtime side.
  string organization = 8;
  string funding = 9;
  repeated string tag = 10;
  repeated string licenses = 11;
}

message ScanResult {
  repeated LibraryEntry libraries = 1;
  map<string, LicenseEntry> licenses = 2;
}
`;

/**
 * Lazily-parsed reflected root. Built once on first use and cached for the
 * lifetime of the process; parsing the schema is cheap but there is no reason
 * to repeat it per scan. Keeping the `Root` alive also keeps the reflected
 * `Type` (looked up below) from being collected.
 */
let cachedRoot: protobuf.Root | null = null;

/**
 * Parse {@link OSSLIBRARIES_PROTO_SCHEMA} once and return the reflected
 * `ScanResult` message type. Subsequent calls return the cached instance.
 *
 * Exposed for tests that need to decode the emitted binary back into an object.
 */
export function getScanResultType(): protobuf.Type {
  if (!cachedRoot) {
    cachedRoot = protobuf.parse(OSSLIBRARIES_PROTO_SCHEMA).root;
  }
  return cachedRoot.lookupType("osslibraries.ScanResult");
}

/** Release the cached reflected root. Intended for test isolation only. */
export function __resetProtoCache(): void {
  cachedRoot = null;
}

/** Output of {@link serializeProto}: the binary payload plus its schema. */
export interface ProtoSerialization {
  /** Protobuf-encoded `osslibraries.ScanResult` bytes. */
  binary: Uint8Array;
  /** The `.proto` schema the runtime parser must load to decode `binary`. */
  schema: string;
}

/**
 * Serialize a {@link ScanResult} to the protobuf wire format.
 *
 * The plain-object form passed to `Type.fromObject` is constructed from the
 * strongly-typed {@link ScanResult} so that snake_case field names and the
 * `licenses` map shape match the schema. `fromObject` (rather than `create`)
 * is used because it performs the relaxed reader/JSON-style conversion that
 * tolerates the `null` values the scanner emits for empty `scm`/`organization`.
 *
 * @returns the encoded bytes and the schema string, ready to be written to
 *          `osslibraries.pb` and `osslibraries.proto` respectively.
 */
export function serializeProto(result: ScanResult): ProtoSerialization {
  const ScanResultType = getScanResultType();

  const message = ScanResultType.fromObject({
    libraries: result.libraries.map((lib) => ({
      uniqueId: lib.uniqueId,
      artifactVersion: lib.artifactVersion,
      name: lib.name,
      description: lib.description,
      website: lib.website,
      developers: lib.developers.map((d) => ({
        name: d.name,
        organisationUrl: d.organisationUrl,
      })),
      // `scm` is nullable in the JSON model; protobuf has no null message, so
      // an absent field encodes the same intent. Omit it when null.
      scm: lib.scm
        ? {
            connection: lib.scm.connection,
            developerConnection: lib.scm.developerConnection,
            url: lib.scm.url,
          }
        : undefined,
      // Free-form JSON values serialized to strings — lossless and
      // schema-self-contained. Empty array / null both serialize canonically.
      // Normalize undefined/missing to null so “no value” is consistently encoded.
      organization: JSON.stringify(lib.organization ?? null),
      funding: JSON.stringify(lib.funding ?? null),
      tag: lib.tag,
      licenses: lib.licenses,
    })),
    // protobufjs accepts a plain object for a map field and uses its keys
    // directly, faithfully mirroring the JSON `Record<string, LicenseEntry>`.
    licenses: result.licenses,
  });

  const binary = ScanResultType.encode(message).finish();
  return { binary, schema: OSSLIBRARIES_PROTO_SCHEMA };
}

/**
 * Decode a protobuf-encoded `osslibraries.ScanResult` back to a plain object.
 *
 * Provided primarily for round-trip tests and as a reference for the runtime
 * side: the shape returned here matches what `serializeProto` consumed, so a
 * test can assert losslessness by re-serializing.
 */
export function deserializeProto(binary: Uint8Array): Record<string, unknown> {
  const ScanResultType = getScanResultType();
  const message = ScanResultType.decode(binary);
  // toObject({ bytes: String }) keeps the output JSON-friendly for assertions.
  return ScanResultType.toObject(message, {
    longs: String,
    bytes: String,
    enums: String,
    defaults: true,
  }) as Record<string, unknown>;
}
