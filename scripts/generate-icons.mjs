/**
 * Regenerates every brand raster from the SVG masters in scripts/assets.
 *
 *   node scripts/generate-icons.mjs
 *
 * The outputs are committed rather than generated at build time: they change
 * only when the branding does, and a build server should not need a working
 * libvips to serve a favicon. Re-run this after editing any master SVG.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "scripts", "assets");

const ROUNDED = join(assets, "icon-master.svg"); // rounded tile, transparent corners
const SQUARE = join(assets, "icon-square.svg"); // full bleed, safe-zone inset
const OG = join(assets, "og-master.svg");

/** Renders one master at one size. density is high so curves stay crisp. */
const render = (src, size) =>
  sharp(src, { density: 1200 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/**
 * Builds a multi-resolution .ico.
 *
 * Each entry is a complete PNG rather than a BMP — every browser that matters
 * has read PNG-in-ICO since Vista, and it keeps the alpha channel intact.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]);
}

async function main() {
  await mkdir(join(root, "public", "icons"), { recursive: true });

  // favicon.ico — 16/24/32/48 so Windows and older browsers pick their own.
  const ico = await Promise.all(
    [16, 24, 32, 48].map(async (size) => ({ size, buf: await render(ROUNDED, size) })),
  );
  await writeFile(join(root, "src", "app", "favicon.ico"), buildIco(ico));

  // Apple home screen: iOS applies its own mask, so this must be full bleed
  // with no transparent corners or it renders with black shoulders.
  await writeFile(join(root, "src", "app", "apple-icon.png"), await render(SQUARE, 180));

  // PWA / Android. "any" keeps the rounded tile, "maskable" is full bleed with
  // the mark inset into the safe zone so a circular mask cannot clip it.
  for (const size of [192, 512]) {
    await writeFile(join(root, "public", "icons", `icon-${size}.png`), await render(ROUNDED, size));
    await writeFile(
      join(root, "public", "icons", `maskable-${size}.png`),
      await render(SQUARE, size),
    );
  }

  // Social share card for the marketing site. Dealer showrooms override this
  // with their own cover photo.
  await sharp(OG, { density: 150 })
    .resize(1200, 630)
    .png({ compressionLevel: 9 })
    .toFile(join(root, "public", "og.png"));

  console.log("Icons written:");
  console.log("  src/app/favicon.ico        16 / 24 / 32 / 48");
  console.log("  src/app/icon.svg           vector");
  console.log("  src/app/apple-icon.png     180");
  console.log("  public/icons/icon-*.png    192 / 512");
  console.log("  public/icons/maskable-*    192 / 512");
  console.log("  public/og.png              1200 x 630");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
