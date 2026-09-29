import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

const PAGE_SIZE = 16_384n;
const PT_LOAD = 1;
const RELEVANT_64_BIT_ABIS = new Set(["arm64-v8a", "x86_64", "riscv64"]);
const ABI_MACHINES = Object.freeze({
  "arm64-v8a": 183,
  x86_64: 62,
  riscv64: 243,
});

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function requireRange(buffer, offset, size, label, field) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0
  ) {
    fail(label, `${field} has an invalid numeric range`);
  }
  if (offset > buffer.length || size > buffer.length - offset) {
    fail(label, `${field} is truncated`);
  }
}

function safeNumber(value, label, field) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(label, `${field} exceeds the safe parser bound`);
  }
  return Number(value);
}

function unsigned(view, offset, size, littleEndian, label, field) {
  requireRange(
    Buffer.from(view.buffer, view.byteOffset, view.byteLength),
    offset,
    size,
    label,
    field,
  );
  if (size === 2) return BigInt(view.getUint16(offset, littleEndian));
  if (size === 4) return BigInt(view.getUint32(offset, littleEndian));
  if (size === 8) return view.getBigUint64(offset, littleEndian);
  fail(label, `${field} uses an unsupported integer width`);
}

export function inspectElf(bytes, label = "ELF") {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 16) fail(label, "ELF header is truncated");
  if (
    buffer[0] !== 0x7f ||
    buffer[1] !== 0x45 ||
    buffer[2] !== 0x4c ||
    buffer[3] !== 0x46
  ) {
    fail(label, "invalid ELF magic");
  }

  const elfClass = buffer[4];
  if (elfClass !== 1 && elfClass !== 2)
    fail(label, `unsupported ELF class ${elfClass}`);
  const byteOrder = buffer[5];
  if (byteOrder !== 1 && byteOrder !== 2)
    fail(label, `unsupported ELF byte order ${byteOrder}`);
  if (buffer[6] !== 1)
    fail(label, `unsupported ELF identification version ${buffer[6]}`);

  const bits = elfClass === 1 ? 32 : 64;
  const littleEndian = byteOrder === 1;
  const headerSize = bits === 64 ? 64 : 52;
  const minimumProgramHeaderSize = bits === 64 ? 56 : 32;
  requireRange(buffer, 0, headerSize, label, "ELF header");
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const machine = Number(
    unsigned(view, 18, 2, littleEndian, label, "ELF machine"),
  );
  const declaredHeaderSize = unsigned(
    view,
    bits === 64 ? 52 : 40,
    2,
    littleEndian,
    label,
    "declared ELF header size",
  );
  if (declaredHeaderSize !== BigInt(headerSize)) {
    fail(
      label,
      `declared ELF header size ${declaredHeaderSize} does not equal ${headerSize}`,
    );
  }
  const programOffset = unsigned(
    view,
    bits === 64 ? 32 : 28,
    bits === 64 ? 8 : 4,
    littleEndian,
    label,
    "program header offset",
  );
  const programEntrySize = unsigned(
    view,
    bits === 64 ? 54 : 42,
    2,
    littleEndian,
    label,
    "program header entry size",
  );
  const programCount = unsigned(
    view,
    bits === 64 ? 56 : 44,
    2,
    littleEndian,
    label,
    "program header count",
  );

  if (programEntrySize < BigInt(minimumProgramHeaderSize)) {
    fail(
      label,
      `program header entry size ${programEntrySize} is below ${minimumProgramHeaderSize}`,
    );
  }
  if (programCount > 0n && programOffset < BigInt(headerSize)) {
    fail(label, "program header table overlaps the ELF header");
  }
  const tableEnd = programOffset + programEntrySize * programCount;
  if (tableEnd > BigInt(buffer.length))
    fail(label, "program header table is truncated");

  const entrySize = safeNumber(
    programEntrySize,
    label,
    "program header entry size",
  );
  const entryCount = safeNumber(programCount, label, "program header count");
  const tableOffset = safeNumber(programOffset, label, "program header offset");
  let loadSegments = 0;
  for (let index = 0; index < entryCount; index += 1) {
    const start = tableOffset + entrySize * index;
    const type = Number(
      unsigned(
        view,
        start,
        4,
        littleEndian,
        label,
        `program header ${index} type`,
      ),
    );
    if (type !== PT_LOAD) continue;

    const fileOffset = unsigned(
      view,
      start + (bits === 64 ? 8 : 4),
      bits === 64 ? 8 : 4,
      littleEndian,
      label,
      `PT_LOAD ${loadSegments} file offset`,
    );
    const virtualAddress = unsigned(
      view,
      start + (bits === 64 ? 16 : 8),
      bits === 64 ? 8 : 4,
      littleEndian,
      label,
      `PT_LOAD ${loadSegments} virtual address`,
    );
    const alignment = unsigned(
      view,
      start + (bits === 64 ? 48 : 28),
      bits === 64 ? 8 : 4,
      littleEndian,
      label,
      `PT_LOAD ${loadSegments} alignment`,
    );
    const fileSize = unsigned(
      view,
      start + (bits === 64 ? 32 : 16),
      bits === 64 ? 8 : 4,
      littleEndian,
      label,
      `PT_LOAD ${loadSegments} file size`,
    );
    const memorySize = unsigned(
      view,
      start + (bits === 64 ? 40 : 20),
      bits === 64 ? 8 : 4,
      littleEndian,
      label,
      `PT_LOAD ${loadSegments} memory size`,
    );
    if (fileSize > memorySize) {
      fail(
        label,
        `PT_LOAD ${loadSegments} file size ${fileSize} exceeds memory size ${memorySize}`,
      );
    }
    if (
      fileOffset > BigInt(buffer.length) ||
      fileSize > BigInt(buffer.length) - fileOffset
    ) {
      fail(label, `PT_LOAD ${loadSegments} file range exceeds the ELF file`);
    }
    if (alignment < PAGE_SIZE) {
      fail(
        label,
        `PT_LOAD ${loadSegments} alignment ${alignment} is below ${PAGE_SIZE}`,
      );
    }
    if ((alignment & (alignment - 1n)) !== 0n) {
      fail(
        label,
        `PT_LOAD ${loadSegments} alignment ${alignment} is not a power of two`,
      );
    }
    if (fileOffset % PAGE_SIZE !== virtualAddress % PAGE_SIZE) {
      fail(
        label,
        `PT_LOAD ${loadSegments} offset and virtual address are not congruent modulo ${PAGE_SIZE}`,
      );
    }
    if (fileOffset % alignment !== virtualAddress % alignment) {
      fail(
        label,
        `PT_LOAD ${loadSegments} offset and virtual address are not congruent modulo p_align ${alignment}`,
      );
    }
    loadSegments += 1;
  }
  if (loadSegments === 0) fail(label, "contains no PT_LOAD segments");
  return {
    bits,
    byteOrder: littleEndian ? "little" : "big",
    machine,
    loadSegments,
  };
}

export async function verifyApkElfAlignment(apkBytes, label = "APK") {
  let archive;
  try {
    archive = await JSZip.loadAsync(apkBytes);
  } catch (error) {
    fail(
      label,
      `could not read APK ZIP: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const libraries = Object.values(archive.files)
    .filter((entry) => {
      if (entry.dir) return false;
      const match = entry.name.match(/^lib\/([^/]+)\/[^/]+\.so$/);
      return Boolean(match && RELEVANT_64_BIT_ABIS.has(match[1]));
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  if (libraries.length === 0)
    fail(label, "contains no 64-bit native shared libraries");

  let loadSegments = 0;
  const inspected = [];
  for (const entry of libraries) {
    const result = inspectElf(
      await entry.async("nodebuffer"),
      `${label}:${entry.name}`,
    );
    const abi = entry.name.split("/")[1];
    if (result.bits !== 64)
      fail(
        `${label}:${entry.name}`,
        `ABI ${abi} requires ELF64, found ELF${result.bits}`,
      );
    if (result.byteOrder !== "little")
      fail(`${label}:${entry.name}`, `ABI ${abi} requires little-endian ELF`);
    if (result.machine !== ABI_MACHINES[abi]) {
      fail(
        `${label}:${entry.name}`,
        `ABI ${abi} requires ELF machine ${ABI_MACHINES[abi]}, found ${result.machine}`,
      );
    }
    loadSegments += result.loadSegments;
    inspected.push({ name: entry.name, ...result });
  }
  return { libraries: libraries.length, loadSegments, inspected };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === "--help") {
    const usage = "Usage: node scripts/verify-elf-alignment.mjs <release.apk>";
    if (args[0] === "--help") {
      console.log(usage);
      return;
    }
    throw new Error(usage);
  }
  const apkPath = path.resolve(args[0]);
  const result = await verifyApkElfAlignment(await readFile(apkPath), apkPath);
  console.log(
    `Verified ${result.libraries} 64-bit native shared libraries and ${result.loadSegments} PT_LOAD segments for 16 KB alignment.`,
  );
  for (const library of result.inspected) {
    console.log(
      `  ${library.name}: ELF${library.bits} ${library.byteOrder}-endian, ${library.loadSegments} PT_LOAD`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      `ELF alignment verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
