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
 * OSSLibraries Hvigor Plugin
 *
 * Build-time OHPM dependency scanner that generates
 * license metadata for the OSSLibraries UI library.
 */
export { ossScanPlugin } from "./plugin.js";
export type { OssScanPluginOptions } from "./plugin.js";
export { scanProject, serializeResult, toOutputObject, buildLibrary } from "./scanner.js";
export { getSerializer } from "./format.js";
export type { OutputFormat, Serializer } from "./format.js";
export { resolveLicense, contentHash } from "./spdx.js";
export { parseJson5, parseOhPackage, readOhPackage } from "./ohpm.js";
export type { ScanResult, ScanOptions, LibraryEntry, LicenseEntry, OhPackage } from "./types.js";
