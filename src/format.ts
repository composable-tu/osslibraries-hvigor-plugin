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

/**
 * Output format selection for the generated license metadata.
 *
 * Each format is a small `Serializer` object that knows how to encode a
 * `ScanResult` into bytes and which file extension goes with it. Adding a new
 * format is a one-liner: append it to `SERIALIZERS` below.
 */

import { encode as encodeMsgPack } from "@msgpack/msgpack";
import { toOutputObject } from "./scanner.js";
import type { ScanResult } from "./types.js";

/** Supported output formats for the generated license metadata. */
export type OutputFormat = "json" | "message-pack";

/**
 * Converts a `ScanResult` into the byte representation of a given format and
 * exposes the file extension that accompanies it on disk.
 */
export interface Serializer {
  /** File extension without the leading dot, e.g. "json" or "msgpack". */
  readonly extension: string;
  /** Human-readable format name, surfaced in build logs. */
  readonly name: string;
  /** Encode a scan result into bytes ready to be written to disk. */
  encode(result: ScanResult): Buffer;
}

/** JSON — human-readable, the default. */
const jsonSerializer: Serializer = {
  extension: "json",
  name: "JSON",
  encode: (result) => Buffer.from(JSON.stringify(toOutputObject(result)), "utf-8"),
};

/** MessagePack — compact binary, ideal for shrinking the HAP payload. */
const messagePackSerializer: Serializer = {
  extension: "msgpack",
  name: "MessagePack",
  encode: (result) => Buffer.from(encodeMsgPack(toOutputObject(result))),
};

const SERIALIZERS: Record<OutputFormat, Serializer> = {
  json: jsonSerializer,
  "message-pack": messagePackSerializer,
};

/** Resolve a format name into its `Serializer`. */
export function getSerializer(format: OutputFormat): Serializer {
  return SERIALIZERS[format];
}
