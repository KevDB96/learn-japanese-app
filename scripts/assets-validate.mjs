import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'public', 'assets');
const manifest = JSON.parse(await readFile(path.join(assetRoot, 'manifest.json'), 'utf8'));
const expectedZipHash = 'd57352b48310801e94fc89e2fbcacbe50019bfe9b4cafe6d3a80b353a3e0d911';
const maxAssetBytes = 2_000_000;
const requiredSlots = [
  'profile.avatar.kevin', 'profile.avatar.janne',
  ...['shared', 'kevin', 'janne'].flatMap((theme) => [512, 192, 180, 32, 16].map((size) => `pwa.icon.${theme}.${size}`)),
  'splash.kevin', 'splash.janne',
  ...['kevin', 'janne'].flatMap((theme) => ['hiragana', 'katakana', 'kana-fluency', 'vocabulary', 'grammar', 'phrases', 'practice'].map((course) => `course.banner.${theme}.${course}`)),
  ...['learning', 'mastered', 'struggling', 'locked', 'lesson-complete', 'course-complete'].flatMap((state) => ['kevin', 'janne'].map((theme) => `status.${state}.${theme}`)),
  ...['no-reviews-due', 'all-caught-up', 'offline', 'syncing', 'saved'].flatMap((state) => ['kevin', 'janne'].map((theme) => `state.${state}.${theme}`)),
  ...['listening', 'practice'].flatMap((activity) => ['kevin', 'janne'].map((theme) => `activity.${activity}.${theme}`)),
  ...['spirit-cat', 'faerie', 'joyful-cat', 'sakura-book'].map((motif) => `motif.${motif}`),
];

function fail(message) {
  console.error(`Asset validation failed: ${message}`);
  process.exit(1);
}

function dimensions(buffer, format) {
  if (format === 'png') {
    if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') fail('invalid PNG signature');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (format !== 'webp' || buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') fail(`unsupported or invalid image format: ${format}`);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > buffer.length) fail('truncated WebP chunk');
    if (kind === 'VP8X' && length >= 10) {
      return { width: 1 + buffer.readUIntLE(start + 4, 3), height: 1 + buffer.readUIntLE(start + 7, 3) };
    }
    if (kind === 'VP8 ' && length >= 10 && buffer[start + 3] === 0x9d && buffer[start + 4] === 0x01 && buffer[start + 5] === 0x2a) {
      return { width: buffer.readUInt16LE(start + 6) & 0x3fff, height: buffer.readUInt16LE(start + 8) & 0x3fff };
    }
    if (kind === 'VP8L' && length >= 5 && buffer[start] === 0x2f) {
      const b1 = buffer[start + 1], b2 = buffer[start + 2], b3 = buffer[start + 3], b4 = buffer[start + 4];
      return { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + ((b2 >> 6) & 3) + (b3 << 2) + ((b4 & 0x0f) << 10) };
    }
    offset = start + length + (length & 1);
  }
  fail('WebP has no supported image header');
}

if (manifest.schema_version !== 1 || manifest.source_manifest?.schema_version !== 2 || manifest.source_manifest.zip_sha256 !== expectedZipHash) fail('manifest/source handoff identity mismatch');
const slotNames = Object.keys(manifest.slots ?? {});
if (new Set(slotNames).size !== slotNames.length) fail('duplicate semantic slot');
for (const slot of requiredSlots) if (!manifest.slots[slot]) fail(`missing semantic slot ${slot}`);
for (const slot of slotNames) if (!requiredSlots.includes(slot)) fail(`unexpected semantic slot ${slot}`);
const files = manifest.files ?? {};
const referencedFiles = new Set(Object.values(manifest.slots));
if (referencedFiles.size !== Object.keys(files).length) fail('unreferenced or duplicate production file');

for (const [relative, record] of Object.entries(files)) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => part === '..' || part === '.' || part === '')) fail(`unsafe asset path ${relative}`);
  const target = path.resolve(assetRoot, relative);
  if (!target.startsWith(`${assetRoot}${path.sep}`)) fail(`asset escaped public/assets: ${relative}`);
  const buffer = await readFile(target);
  const info = await stat(target);
  if (!info.isFile() || info.size > maxAssetBytes || info.size !== record.bytes) fail(`invalid size/file type for ${relative}`);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hash !== record.sha256) fail(`SHA-256 mismatch for ${relative}`);
  const actual = dimensions(buffer, record.format);
  if (actual.width !== record.width || actual.height !== record.height || actual.width < 1 || actual.height < 1) fail(`dimension mismatch for ${relative}`);
  if (!Array.isArray(record.sources) || record.sources.length === 0) fail(`missing artwork provenance for ${relative}`);
  for (const source of record.sources) {
    if (!source.original_png?.endsWith('.png') || !/^[a-f0-9]{64}$/.test(source.original_png_sha256 ?? '') || !/^[a-f0-9]{64}$/.test(source.transfer_sha256 ?? '')) fail(`invalid artwork provenance for ${relative}`);
  }
}

for (const theme of ['shared', 'kevin', 'janne']) {
  for (const size of [512, 192, 180, 32, 16]) {
    const file = files[manifest.slots[`pwa.icon.${theme}.${size}`]];
    if (file.format !== 'png' || file.width !== size || file.height !== size) fail(`invalid ${theme} ${size}px PWA icon`);
  }
}

console.log(`Assets valid (${referencedFiles.size} files, ${slotNames.length} slots).`);
