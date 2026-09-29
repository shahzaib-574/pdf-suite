import assert from "node:assert/strict";

import JSZip from "jszip";

import { inspectElf, verifyApkElfAlignment } from "./verify-elf-alignment.mjs";

const PAGE_SIZE = 16_384n;

function writeUnsigned(buffer, offset, bytes, value, littleEndian) {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  if (bytes === 2) view.setUint16(offset, Number(value), littleEndian);
  else if (bytes === 4) view.setUint32(offset, Number(value), littleEndian);
  else if (bytes === 8) view.setBigUint64(offset, BigInt(value), littleEndian);
  else throw new Error(`Unsupported fixture integer width: ${bytes}`);
}

function makeElf({
  bits = 64,
  littleEndian = true,
  machine = bits === 64 ? 183 : 3,
  segments,
} = {}) {
  const is64 = bits === 64;
  const headerSize = is64 ? 64 : 52;
  const programHeaderSize = is64 ? 56 : 32;
  const loadSegments = segments ?? [
    {
      offset: 0n,
      virtualAddress: 0n,
      alignment: PAGE_SIZE,
      fileSize: 1n,
      memorySize: 1n,
    },
    {
      offset: PAGE_SIZE,
      virtualAddress: 0x4000n,
      alignment: PAGE_SIZE,
      fileSize: 1n,
      memorySize: 1n,
    },
  ];
  const fileEnd = loadSegments.reduce(
    (maximum, segment) => {
      const end = segment.offset + (segment.fileSize ?? 1n);
      return end > maximum ? end : maximum;
    },
    BigInt(headerSize + programHeaderSize * loadSegments.length),
  );
  const buffer = Buffer.alloc(Number(fileEnd));
  buffer.set([0x7f, 0x45, 0x4c, 0x46, is64 ? 2 : 1, littleEndian ? 1 : 2, 1]);
  writeUnsigned(buffer, 18, 2, BigInt(machine), littleEndian);
  writeUnsigned(buffer, is64 ? 52 : 40, 2, BigInt(headerSize), littleEndian);
  writeUnsigned(
    buffer,
    is64 ? 32 : 28,
    is64 ? 8 : 4,
    BigInt(headerSize),
    littleEndian,
  );
  writeUnsigned(
    buffer,
    is64 ? 54 : 42,
    2,
    BigInt(programHeaderSize),
    littleEndian,
  );
  writeUnsigned(
    buffer,
    is64 ? 56 : 44,
    2,
    BigInt(loadSegments.length),
    littleEndian,
  );

  loadSegments.forEach((segment, index) => {
    const start = headerSize + programHeaderSize * index;
    writeUnsigned(buffer, start, 4, 1n, littleEndian); // PT_LOAD
    if (is64) {
      writeUnsigned(buffer, start + 8, 8, segment.offset, littleEndian);
      writeUnsigned(
        buffer,
        start + 16,
        8,
        segment.virtualAddress,
        littleEndian,
      );
      writeUnsigned(
        buffer,
        start + 32,
        8,
        segment.fileSize ?? 1n,
        littleEndian,
      );
      writeUnsigned(
        buffer,
        start + 40,
        8,
        segment.memorySize ?? segment.fileSize ?? 1n,
        littleEndian,
      );
      writeUnsigned(buffer, start + 48, 8, segment.alignment, littleEndian);
    } else {
      writeUnsigned(buffer, start + 4, 4, segment.offset, littleEndian);
      writeUnsigned(buffer, start + 8, 4, segment.virtualAddress, littleEndian);
      writeUnsigned(
        buffer,
        start + 16,
        4,
        segment.fileSize ?? 1n,
        littleEndian,
      );
      writeUnsigned(
        buffer,
        start + 20,
        4,
        segment.memorySize ?? segment.fileSize ?? 1n,
        littleEndian,
      );
      writeUnsigned(buffer, start + 28, 4, segment.alignment, littleEndian);
    }
  });
  return buffer;
}

for (const bits of [32, 64]) {
  for (const littleEndian of [true, false]) {
    const result = inspectElf(
      makeElf({ bits, littleEndian }),
      `${bits}-${littleEndian}`,
    );
    assert.equal(result.bits, bits);
    assert.equal(result.loadSegments, 2);
  }
}

assert.throws(
  () =>
    inspectElf(
      makeElf({
        segments: [{ offset: 0n, virtualAddress: 0n, alignment: 4096n }],
      }),
      "small-align",
    ),
  /PT_LOAD 0 alignment 4096 is below 16384/,
);
assert.throws(
  () =>
    inspectElf(
      makeElf({
        segments: [
          { offset: 0n, virtualAddress: PAGE_SIZE, alignment: 32_768n },
        ],
      }),
      "p-align",
    ),
  /not congruent modulo p_align 32768/,
);
assert.throws(
  () =>
    inspectElf(
      makeElf({
        segments: [
          {
            offset: 0n,
            virtualAddress: 0n,
            alignment: PAGE_SIZE,
            fileSize: 2n,
            memorySize: 1n,
          },
        ],
      }),
      "sizes",
    ),
  /file size 2 exceeds memory size 1/,
);
assert.throws(
  () =>
    inspectElf(
      makeElf({
        segments: [{ offset: 0n, virtualAddress: 4096n, alignment: PAGE_SIZE }],
      }),
      "incongruent",
    ),
  /PT_LOAD 0 offset and virtual address are not congruent modulo 16384/,
);
assert.throws(
  () => inspectElf(Buffer.alloc(8), "truncated"),
  /ELF header is truncated/,
);
assert.throws(() => inspectElf(Buffer.alloc(16, 0x41), "magic"), /ELF magic/);

const badClass = makeElf();
badClass[4] = 3;
assert.throws(() => inspectElf(badClass, "class"), /unsupported ELF class/);
const badEndian = makeElf();
badEndian[5] = 3;
assert.throws(
  () => inspectElf(badEndian, "endian"),
  /unsupported ELF byte order/,
);
assert.throws(
  () => inspectElf(makeElf({ segments: [] }), "zero-load"),
  /contains no PT_LOAD segments/,
);
assert.throws(
  () => inspectElf(makeElf().subarray(0, 80), "truncated-program-headers"),
  /program header table is truncated/,
);
const overlap = makeElf({ segments: [] });
writeUnsigned(overlap, 32, 8, 1n, true);
writeUnsigned(overlap, 56, 2, 1n, true);
assert.throws(
  () => inspectElf(overlap, "overlap"),
  /program header table overlaps the ELF header/,
);
const outOfFile = makeElf({
  segments: [{ offset: 4096n, virtualAddress: 4096n, alignment: PAGE_SIZE }],
}).subarray(0, 128);
assert.throws(
  () => inspectElf(outOfFile, "file-range"),
  /file range exceeds the ELF file/,
);

const emptyApk = new JSZip();
emptyApk.file("classes.dex", Buffer.from("fixture"));
const emptyApkBytes = await emptyApk.generateAsync({ type: "nodebuffer" });
await assert.rejects(
  () => verifyApkElfAlignment(emptyApkBytes, "empty.apk"),
  /contains no 64-bit native shared libraries/,
);

const validApk = new JSZip();
validApk.file(
  "lib/armeabi-v7a/libignored32.so",
  makeElf({
    bits: 32,
    segments: [{ offset: 0n, virtualAddress: 0n, alignment: 4096n }],
  }),
);
validApk.file("lib/arm64-v8a/libfixture.so", makeElf({ machine: 183 }));
validApk.file("lib/x86_64/libfixture.so", makeElf({ machine: 62 }));
const result = await verifyApkElfAlignment(
  await validApk.generateAsync({ type: "nodebuffer" }),
  "valid.apk",
);
assert.equal(result.libraries, 2);
assert.equal(result.loadSegments, 4);

const wrongMachineApk = new JSZip();
wrongMachineApk.file("lib/x86_64/libfixture.so", makeElf({ machine: 183 }));
const wrongMachineApkBytes = await wrongMachineApk.generateAsync({
  type: "nodebuffer",
});
await assert.rejects(
  () => verifyApkElfAlignment(wrongMachineApkBytes, "machine.apk"),
  /ABI x86_64 requires ELF machine 62, found 183/,
);

const bigEndianApk = new JSZip();
bigEndianApk.file(
  "lib/arm64-v8a/libfixture.so",
  makeElf({ littleEndian: false, machine: 183 }),
);
const bigEndianApkBytes = await bigEndianApk.generateAsync({
  type: "nodebuffer",
});
await assert.rejects(
  () => verifyApkElfAlignment(bigEndianApkBytes, "endian.apk"),
  /ABI arm64-v8a requires little-endian ELF/,
);

console.log(
  "ELF_ALIGNMENT_TEST_OK 32/64-bit little/big-endian malformed zero-lib alignment congruence",
);
