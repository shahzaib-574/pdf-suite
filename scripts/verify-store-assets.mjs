import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ONE_MEBIBYTE = 1024 * 1024
const MAX_ALT_TEXT_CHARACTERS = 140
const PROVENANCE_FILE_NAME = 'capture-provenance.json'
const EXPECTED_PACKAGE_NAME = 'com.reampdf.mobile'
const EXPECTED_CAPTURE_API_LEVEL = 36
const SHA256_PATTERN = /^[0-9A-F]{64}$/
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/

const PLANNED_SCREENSHOTS = [
  '01-tools-home-1080x1920.png',
  '02-scan-intake-1080x1920.png',
  '03-pdf-to-word-1080x1920.png',
  '04-pdf-reader-1080x1920.png',
  '05-organize-pages-1080x1920.png',
  '06-recents-1080x1920.png',
]

const CRC_TABLE = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function fail(message) {
  throw new Error(message)
}

function characterCount(value) {
  return Array.from(value).length
}

function crc32(parts) {
  let crc = 0xffffffff
  for (const part of parts) {
    for (const byte of part) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function parsePng(buffer, label) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(`${label} is not a PNG file.`)
  }

  let offset = PNG_SIGNATURE.length
  let ihdr
  let sawIend = false
  const idatParts = []
  const chunkTypes = []

  while (offset < buffer.length) {
    if (sawIend) fail(`${label} contains data after its IEND chunk.`)
    if (buffer.length - offset < 12) fail(`${label} has a truncated PNG chunk header.`)

    const length = buffer.readUInt32BE(offset)
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const chunkEnd = dataEnd + 4
    if (dataEnd < dataStart || chunkEnd > buffer.length) {
      fail(`${label} has a PNG chunk whose declared length exceeds the file.`)
    }

    const typeBytes = buffer.subarray(offset + 4, offset + 8)
    const type = typeBytes.toString('ascii')
    if (!/^[A-Za-z]{4}$/.test(type)) fail(`${label} has an invalid PNG chunk type.`)

    const data = buffer.subarray(dataStart, dataEnd)
    const expectedCrc = buffer.readUInt32BE(dataEnd)
    const actualCrc = crc32([typeBytes, data])
    if (expectedCrc !== actualCrc) fail(`${label} has a corrupt ${type} chunk (CRC mismatch).`)

    if (chunkTypes.length === 0 && type !== 'IHDR') fail(`${label} does not start with an IHDR chunk.`)
    if (type === 'IHDR') {
      if (ihdr) fail(`${label} contains more than one IHDR chunk.`)
      if (length !== 13) fail(`${label} has an invalid IHDR length.`)
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      }
      if (ihdr.width === 0 || ihdr.height === 0) fail(`${label} has zero-sized PNG dimensions.`)
      if (ihdr.compression !== 0 || ihdr.filter !== 0) fail(`${label} uses an unsupported PNG encoding.`)
      if (ihdr.interlace !== 0) fail(`${label} must be a non-interlaced PNG.`)
    } else if (type === 'IDAT') {
      if (!ihdr) fail(`${label} has IDAT data before IHDR.`)
      idatParts.push(data)
    } else if (type === 'IEND') {
      if (length !== 0) fail(`${label} has an invalid IEND chunk.`)
      sawIend = true
    }

    chunkTypes.push(type)
    offset = chunkEnd
  }

  if (!ihdr) fail(`${label} is missing its IHDR chunk.`)
  if (idatParts.length === 0) fail(`${label} is missing image data.`)
  if (!sawIend) fail(`${label} is missing its IEND chunk.`)

  return { ...ihdr, chunkTypes, idatParts }
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left
  if (aboveDistance <= upperLeftDistance) return above
  return upperLeft
}

function decodeScanlines(png, bytesPerPixel, label) {
  const rowBytes = png.width * bytesPerPixel
  const expectedLength = png.height * (rowBytes + 1)
  let encoded
  try {
    encoded = inflateSync(Buffer.concat(png.idatParts), { maxOutputLength: expectedLength + 1 })
  } catch (error) {
    fail(`${label} has invalid or unexpectedly large compressed image data: ${error.message}`)
  }
  if (encoded.length !== expectedLength) {
    fail(`${label} has ${encoded.length} decoded bytes; expected ${expectedLength}.`)
  }

  const rows = []
  let previous = Buffer.alloc(rowBytes)
  let sourceOffset = 0
  for (let rowIndex = 0; rowIndex < png.height; rowIndex += 1) {
    const filterType = encoded[sourceOffset]
    sourceOffset += 1
    if (filterType > 4) fail(`${label} uses unknown PNG filter ${filterType} on row ${rowIndex + 1}.`)

    const row = Buffer.allocUnsafe(rowBytes)
    for (let byteIndex = 0; byteIndex < rowBytes; byteIndex += 1) {
      const source = encoded[sourceOffset + byteIndex]
      const left = byteIndex >= bytesPerPixel ? row[byteIndex - bytesPerPixel] : 0
      const above = previous[byteIndex]
      const upperLeft = byteIndex >= bytesPerPixel ? previous[byteIndex - bytesPerPixel] : 0
      let predictor = 0
      if (filterType === 1) predictor = left
      else if (filterType === 2) predictor = above
      else if (filterType === 3) predictor = Math.floor((left + above) / 2)
      else if (filterType === 4) predictor = paethPredictor(left, above, upperLeft)
      row[byteIndex] = (source + predictor) & 0xff
    }
    sourceOffset += rowBytes
    rows.push(row)
    previous = row
  }
  return rows
}

function requirePngShape(png, expectation, label) {
  if (png.width !== expectation.width || png.height !== expectation.height) {
    fail(`${label} is ${png.width}x${png.height}; expected ${expectation.width}x${expectation.height}.`)
  }
  if (png.bitDepth !== 8 || png.colorType !== expectation.colorType) {
    fail(`${label} must be ${expectation.format}; found bit depth ${png.bitDepth}, color type ${png.colorType}.`)
  }
  if (expectation.colorType === 2 && png.chunkTypes.includes('tRNS')) {
    fail(`${label} contains a tRNS transparency chunk; it must have no alpha/transparency.`)
  }
}

function requireFullyOpaqueRgba(png, label) {
  const rows = decodeScanlines(png, 4, label)
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    for (let byteIndex = 3; byteIndex < row.length; byteIndex += 4) {
      if (row[byteIndex] !== 255) {
        fail(`${label} contains a non-opaque pixel at x=${(byteIndex - 3) / 4}, y=${rowIndex}.`)
      }
    }
  }
}

function validatePngFile(filePath, expectation, label) {
  const fileSize = statSync(filePath).size
  if (fileSize > expectation.maxBytes) {
    fail(`${label} is ${fileSize} bytes; the limit is ${expectation.maxBytes} bytes.`)
  }
  const png = parsePng(readFileSync(filePath), label)
  requirePngShape(png, expectation, label)
  if (expectation.requireOpaqueRgba) requireFullyOpaqueRgba(png, label)
  else decodeScanlines(png, 3, label)
  return { fileSize, png }
}

function normalizeAltText(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function readSectionAltText(markdown, sectionName, label) {
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^##\\s+${escapedName}\\s*$`, 'im')
  const match = heading.exec(markdown)
  if (!match) fail(`${label} is missing the “${sectionName}” section.`)
  const remainder = markdown.slice(match.index + match[0].length)
  const nextHeading = remainder.search(/^#{1,6}\s+/m)
  const section = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading)
  const altText = normalizeAltText(section)
  if (!altText) fail(`${label} has blank alt text for ${sectionName}.`)
  if (characterCount(altText) > MAX_ALT_TEXT_CHARACTERS) {
    fail(`${label} ${sectionName} alt text is ${characterCount(altText)} characters; maximum is ${MAX_ALT_TEXT_CHARACTERS}.`)
  }
  return altText
}

function readScreenshotAltText(markdown, label) {
  const rows = new Map()
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*(.*?)\s*\|\s*$/)
    if (!match) continue
    const [, fileName, rawAltText] = match
    if (rows.has(fileName)) fail(`${label} lists ${fileName} more than once.`)
    rows.set(fileName, normalizeAltText(rawAltText))
  }
  return rows
}

function isPlaceholderAltText(value) {
  return /^\[[^\]]*\]$/.test(value) || /\b(?:TODO|TBD)\b/i.test(value)
}

function requireExactObject(value, expectedKeys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object.`)
  }
  const actualKeys = Object.keys(value)
  const expected = new Set(expectedKeys)
  const missing = expectedKeys.filter((key) => !Object.hasOwn(value, key))
  const unknown = actualKeys.filter((key) => !expected.has(key))
  if (missing.length > 0 || unknown.length > 0) {
    const details = []
    if (missing.length > 0) details.push(`missing ${missing.join(', ')}`)
    if (unknown.length > 0) details.push(`unknown ${unknown.join(', ')}`)
    fail(`${label} has invalid schema fields (${details.join('; ')}).`)
  }
  return value
}

function requireNonblankText(value, label) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || /[\r\n]/.test(value)) {
    fail(`${label} must be a nonblank, single-line string without surrounding whitespace.`)
  }
  return value
}

function requireSha256(value, label) {
  requireNonblankText(value, label)
  if (!SHA256_PATTERN.test(value)) fail(`${label} must be 64 uppercase hexadecimal characters.`)
  return value
}

function requireUtcTimestamp(value, label) {
  requireNonblankText(value, label)
  if (!UTC_TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    fail(`${label} must be an ISO-8601 UTC timestamp ending in Z.`)
  }
  return value
}

function stripGradleComments(source, label) {
  let inBlockComment = false
  let output = ''
  for (let index = 0; index < source.length; index += 1) {
    if (!inBlockComment && source[index] === '/' && source[index + 1] === '*') {
      inBlockComment = true
      output += '  '
      index += 1
    } else if (inBlockComment && source[index] === '*' && source[index + 1] === '/') {
      inBlockComment = false
      output += '  '
      index += 1
    } else if (inBlockComment) {
      output += source[index] === '\r' || source[index] === '\n' ? source[index] : ' '
    } else if (source[index] === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\r' && source[index] !== '\n') {
        output += ' '
        index += 1
      }
      index -= 1
    } else {
      output += source[index]
    }
  }
  if (inBlockComment) fail(`${label} contains an unterminated block comment.`)
  return output
}

function readGradleReleaseIdentity(repoRoot) {
  const relativePath = join('android', 'variables.gradle')
  const source = stripGradleComments(readFileSync(join(repoRoot, relativePath), 'utf8'), relativePath)
  const lines = source.split(/\r?\n/)
  const findAssignment = (fieldName) => {
    const matchingLines = lines.filter((line) => new RegExp(`^\\s*(?:ext\\.)?${fieldName}\\b`).test(line))
    if (matchingLines.length !== 1) {
      fail(`${relativePath} must define ${fieldName} exactly once; found ${matchingLines.length}.`)
    }
    return matchingLines[0]
  }

  const versionCodeLine = findAssignment('appVersionCode')
  const versionCodeText = versionCodeLine.match(/^\s*(?:ext\.)?appVersionCode\s*=\s*([1-9]\d*)\s*;?\s*$/)?.[1]
  const versionCode = Number(versionCodeText)
  if (!versionCodeText || !Number.isSafeInteger(versionCode)) {
    fail(`${relativePath} appVersionCode must be a positive safe integer literal.`)
  }

  const versionNameLine = findAssignment('appVersionName')
  const versionNameMatch = versionNameLine.match(/^\s*(?:ext\.)?appVersionName\s*=\s*(['"])([^'"\r\n]+)\1\s*;?\s*$/)
  const versionName = versionNameMatch?.[2]
  if (!versionName || versionName.trim() !== versionName) {
    fail(`${relativePath} appVersionName must be a nonblank quoted string literal.`)
  }
  return { versionCode, versionName }
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase()
}

function validateCaptureProvenance(manifest, imageEntries, releaseIdentity, readScreenshotBytes) {
  requireExactObject(
    manifest,
    [
      'schemaVersion',
      'packageName',
      'versionCode',
      'versionName',
      'androidApiLevel',
      'device',
      'serial',
      'signingCertificateSha256',
      'installedApkSha256',
      'generatedAtUtc',
      'screenshots',
    ],
    'Capture provenance manifest',
  )
  if (manifest.schemaVersion !== 1) fail('Capture provenance schemaVersion must be exactly 1.')
  if (requireNonblankText(manifest.packageName, 'Capture provenance packageName') !== EXPECTED_PACKAGE_NAME) {
    fail(`Capture provenance packageName must be exactly ${EXPECTED_PACKAGE_NAME}.`)
  }
  if (!Number.isSafeInteger(manifest.versionCode) || manifest.versionCode !== releaseIdentity.versionCode) {
    fail(`Capture provenance versionCode must match android/variables.gradle (${releaseIdentity.versionCode}).`)
  }
  if (requireNonblankText(manifest.versionName, 'Capture provenance versionName') !== releaseIdentity.versionName) {
    fail(`Capture provenance versionName must match android/variables.gradle (${releaseIdentity.versionName}).`)
  }
  if (!Number.isSafeInteger(manifest.androidApiLevel) || manifest.androidApiLevel !== EXPECTED_CAPTURE_API_LEVEL) {
    fail(`Capture provenance androidApiLevel must be exactly ${EXPECTED_CAPTURE_API_LEVEL}.`)
  }

  const device = requireExactObject(manifest.device, ['manufacturer', 'model', 'name'], 'Capture provenance device')
  for (const fieldName of ['manufacturer', 'model', 'name']) {
    requireNonblankText(device[fieldName], `Capture provenance device.${fieldName}`)
  }
  requireNonblankText(manifest.serial, 'Capture provenance serial')
  requireSha256(manifest.signingCertificateSha256, 'Capture provenance signingCertificateSha256')
  requireSha256(manifest.installedApkSha256, 'Capture provenance installedApkSha256')
  requireUtcTimestamp(manifest.generatedAtUtc, 'Capture provenance generatedAtUtc')

  if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length === 0) {
    fail('Capture provenance screenshots must be a non-empty array.')
  }
  const plannedNames = new Set(PLANNED_SCREENSHOTS)
  const imageNames = new Set(imageEntries)
  const coveredNames = new Set()
  for (const [entryIndex, entryValue] of manifest.screenshots.entries()) {
    const label = `Capture provenance screenshot entry ${entryIndex + 1}`
    const entry = requireExactObject(entryValue, ['fileName', 'capturedAtUtc', 'sha256'], label)
    const fileName = requireNonblankText(entry.fileName, `${label} fileName`)
    if (!plannedNames.has(fileName)) fail(`${label} has an unplanned filename: ${fileName}.`)
    if (coveredNames.has(fileName)) fail(`Capture provenance contains duplicate screenshot entry: ${fileName}.`)
    if (!imageNames.has(fileName)) fail(`Capture provenance covers missing screenshot file: ${fileName}.`)
    requireUtcTimestamp(entry.capturedAtUtc, `${label} capturedAtUtc`)
    const recordedHash = requireSha256(entry.sha256, `${label} sha256`)
    const actualHash = sha256Hex(readScreenshotBytes(fileName))
    if (recordedHash !== actualHash) {
      fail(`Capture provenance hash mismatch for ${fileName}: recorded ${recordedHash}, actual ${actualHash}.`)
    }
    coveredNames.add(fileName)
  }
  for (const fileName of imageEntries) {
    if (!coveredNames.has(fileName)) fail(`Screenshot ${fileName} is not covered by capture-provenance.json.`)
  }
  return coveredNames.size
}

function validateStoreAssets(repoRoot) {
  const storeRoot = join(repoRoot, 'store-assets')
  const graphicsRoot = join(storeRoot, 'graphics')
  const listingAltPath = join(storeRoot, 'listing', 'en-US', 'alt-text.md')
  const screenshotsRoot = join(storeRoot, 'screenshots')
  const screenshotAltPath = join(screenshotsRoot, 'ALT_TEXT_TEMPLATE.md')
  const provenancePath = join(screenshotsRoot, PROVENANCE_FILE_NAME)
  const results = []

  const icon = validatePngFile(
    join(graphicsRoot, 'app-icon-512.png'),
    {
      width: 512,
      height: 512,
      colorType: 6,
      format: 'an 8-bit, 32-bit RGBA PNG',
      maxBytes: ONE_MEBIBYTE,
      requireOpaqueRgba: true,
    },
    'App icon',
  )
  results.push(`App icon: 512x512 opaque RGBA PNG (${icon.fileSize} bytes)`)

  const feature = validatePngFile(
    join(graphicsRoot, 'feature-graphic-1024x500.png'),
    {
      width: 1024,
      height: 500,
      colorType: 2,
      format: 'an 8-bit, 24-bit RGB PNG with no alpha',
      maxBytes: 15 * ONE_MEBIBYTE,
      requireOpaqueRgba: false,
    },
    'Feature graphic',
  )
  results.push(`Feature graphic: 1024x500 RGB PNG (${feature.fileSize} bytes)`)

  const listingAltMarkdown = readFileSync(listingAltPath, 'utf8')
  const iconAlt = readSectionAltText(listingAltMarkdown, 'App icon', 'Graphic alt-text file')
  const featureAlt = readSectionAltText(listingAltMarkdown, 'Feature graphic', 'Graphic alt-text file')
  results.push(`Graphic alt text: icon ${characterCount(iconAlt)}, feature ${characterCount(featureAlt)} characters`)

  const imageEntries = readdirSync(screenshotsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ['.png', '.jpg', '.jpeg', '.webp'].includes(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort()

  if (imageEntries.length === 0) {
    if (existsSync(provenancePath)) {
      fail(`${PROVENANCE_FILE_NAME} exists without any screenshot images.`)
    }
    return { results, screenshotsPending: true }
  }
  if (imageEntries.length < 2 || imageEntries.length > 8) {
    fail(`Screenshot count is ${imageEntries.length}; Google Play requires 2–8 phone screenshots.`)
  }

  const plannedNames = new Set(PLANNED_SCREENSHOTS)
  const unexpectedNames = imageEntries.filter((name) => !plannedNames.has(name))
  if (unexpectedNames.length > 0) {
    fail(`Unexpected screenshot filename(s): ${unexpectedNames.join(', ')}. Use the exact names in CAPTURE_PLAN.md.`)
  }

  const altRows = readScreenshotAltText(readFileSync(screenshotAltPath, 'utf8'), 'Screenshot alt-text file')
  for (const fileName of imageEntries) {
    validatePngFile(
      join(screenshotsRoot, fileName),
      {
        width: 1080,
        height: 1920,
        colorType: 2,
        format: 'an 8-bit, 24-bit RGB PNG with no alpha',
        maxBytes: 8 * ONE_MEBIBYTE,
        requireOpaqueRgba: false,
      },
      `Screenshot ${fileName}`,
    )

    const altText = altRows.get(fileName) ?? ''
    if (!altText || isPlaceholderAltText(altText)) {
      fail(`Screenshot ${fileName} needs nonblank final alt text in ALT_TEXT_TEMPLATE.md.`)
    }
    if (characterCount(altText) > MAX_ALT_TEXT_CHARACTERS) {
      fail(`Screenshot ${fileName} alt text is ${characterCount(altText)} characters; maximum is ${MAX_ALT_TEXT_CHARACTERS}.`)
    }
  }
  if (!existsSync(provenancePath)) {
    fail(`Screenshots exist but ${PROVENANCE_FILE_NAME} is missing.`)
  }

  let provenance
  try {
    provenance = JSON.parse(readFileSync(provenancePath, 'utf8'))
  } catch (error) {
    fail(`${PROVENANCE_FILE_NAME} is not valid JSON: ${error.message}`)
  }
  const provenanceCount = validateCaptureProvenance(
    provenance,
    imageEntries,
    readGradleReleaseIdentity(repoRoot),
    (fileName) => readFileSync(join(screenshotsRoot, fileName)),
  )
  results.push(`Screenshots: ${imageEntries.length} planned 1080x1920 RGB PNGs with final alt text`)
  results.push(`Capture provenance: schema 1 with ${provenanceCount} verified screenshot SHA-256 hashes`)
  return { results, screenshotsPending: false }
}

function makePng(width, height, colorType, pixelBytes) {
  const bytesPerPixel = colorType === 6 ? 4 : 3
  const rowBytes = width * bytesPerPixel
  const scanlines = Buffer.alloc(height * (rowBytes + 1))
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (rowBytes + 1)
    scanlines[rowStart] = 0
    for (let pixel = 0; pixel < width; pixel += 1) {
      Buffer.from(pixelBytes).copy(scanlines, rowStart + 1 + pixel * bytesPerPixel)
    }
  }

  const chunk = (type, data) => {
    const typeBytes = Buffer.from(type, 'ascii')
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32([typeBytes, data]))
    return Buffer.concat([length, typeBytes, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = colorType
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function runSelfTest() {
  const opaque = parsePng(makePng(2, 2, 6, [20, 40, 60, 255]), 'Self-test opaque image')
  requirePngShape(opaque, { width: 2, height: 2, colorType: 6, format: 'RGBA' }, 'Self-test opaque image')
  requireFullyOpaqueRgba(opaque, 'Self-test opaque image')

  const transparent = parsePng(makePng(1, 1, 6, [20, 40, 60, 254]), 'Self-test transparent image')
  let rejectedTransparency = false
  try {
    requireFullyOpaqueRgba(transparent, 'Self-test transparent image')
  } catch (error) {
    rejectedTransparency = /non-opaque pixel/.test(error.message)
  }
  if (!rejectedTransparency) fail('Self-test did not reject a transparent RGBA pixel.')

  const corrupt = Buffer.from(makePng(1, 1, 2, [20, 40, 60]))
  corrupt[corrupt.length - 1] ^= 0xff
  let rejectedCorruption = false
  try {
    parsePng(corrupt, 'Self-test corrupt image')
  } catch (error) {
    rejectedCorruption = /CRC mismatch/.test(error.message)
  }
  if (!rejectedCorruption) fail('Self-test did not reject a corrupt PNG chunk.')

  const altRows = readScreenshotAltText('| `01-tools-home-1080x1920.png` | Useful tools home. |', 'Self-test alt text')
  if (altRows.get('01-tools-home-1080x1920.png') !== 'Useful tools home.') {
    fail('Self-test did not parse screenshot alt text.')
  }

  const screenshotName = PLANNED_SCREENSHOTS[0]
  const screenshotBytes = Buffer.from('self-test screenshot bytes')
  const provenance = {
    schemaVersion: 1,
    packageName: EXPECTED_PACKAGE_NAME,
    versionCode: 7,
    versionName: '7.0.0',
    androidApiLevel: EXPECTED_CAPTURE_API_LEVEL,
    device: { manufacturer: 'Android', model: 'Virtual device', name: 'test_avd' },
    serial: 'emulator-5554',
    signingCertificateSha256: 'A'.repeat(64),
    installedApkSha256: 'B'.repeat(64),
    generatedAtUtc: '2026-08-22T12:00:00.0000000Z',
    screenshots: [
      {
        fileName: screenshotName,
        capturedAtUtc: '2026-08-22T11:59:00Z',
        sha256: sha256Hex(screenshotBytes),
      },
    ],
  }
  const selfTestReader = (fileName) => {
    if (fileName !== screenshotName) fail(`Unexpected self-test screenshot request: ${fileName}`)
    return screenshotBytes
  }
  validateCaptureProvenance(provenance, [screenshotName], { versionCode: 7, versionName: '7.0.0' }, selfTestReader)

  const badHashProvenance = structuredClone(provenance)
  badHashProvenance.screenshots[0].sha256 = '0'.repeat(64)
  let rejectedHashMismatch = false
  try {
    validateCaptureProvenance(
      badHashProvenance,
      [screenshotName],
      { versionCode: 7, versionName: '7.0.0' },
      selfTestReader,
    )
  } catch (error) {
    rejectedHashMismatch = /hash mismatch/.test(error.message)
  }
  if (!rejectedHashMismatch) fail('Self-test did not reject a screenshot provenance hash mismatch.')

  const badSchemaProvenance = structuredClone(provenance)
  badSchemaProvenance.schemaVersion = 2
  let rejectedBadSchema = false
  try {
    validateCaptureProvenance(
      badSchemaProvenance,
      [screenshotName],
      { versionCode: 7, versionName: '7.0.0' },
      selfTestReader,
    )
  } catch (error) {
    rejectedBadSchema = /schemaVersion must be exactly 1/.test(error.message)
  }
  if (!rejectedBadSchema) fail('Self-test did not reject an unsupported provenance schema.')
  console.log('Store asset verifier self-test passed.')
}

const argumentsList = process.argv.slice(2)
if (argumentsList.length > 1 || (argumentsList.length === 1 && argumentsList[0] !== '--self-test')) {
  console.error('Usage: node scripts/verify-store-assets.mjs [--self-test]')
  process.exitCode = 2
} else {
  try {
    if (argumentsList[0] === '--self-test') {
      runSelfTest()
    } else {
      const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
      const outcome = validateStoreAssets(repoRoot)
      for (const result of outcome.results) console.log(`✓ ${result}`)
      if (outcome.screenshotsPending) {
        console.log('PENDING: Real Android screenshots have not been captured yet; pre-capture validation remains successful.')
      }
      console.log('Store asset verification passed.')
    }
  } catch (error) {
    console.error(`Store asset verification failed: ${error.message}`)
    process.exitCode = 1
  }
}
