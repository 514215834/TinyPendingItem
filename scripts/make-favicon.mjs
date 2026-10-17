/**
 * 一次性工具：把 ffmpeg 导出的 256x256 RGBA 原始数据加工为带圆角透明边缘的 favicon.png
 * 用法：node scripts/make-favicon.mjs <raw> <out> [size=256] [radius=57]
 * 无第三方依赖：PNG 编码用 Node 内置 zlib（CRC32 自实现）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const [rawPath, outPath, sizeArg, radiusArg] = process.argv.slice(2)
const SIZE = Number(sizeArg) || 256
const R = Number(radiusArg) || 57 // 圆角半径 ≈ 22.3%，接近现代应用图标观感

const raw = readFileSync(rawPath)
if (raw.length !== SIZE * SIZE * 4) {
  throw new Error(`原始数据长度不符：期望 ${SIZE * SIZE * 4}，实际 ${raw.length}`)
}

// 圆角矩形内阴影距离：>0 在内部。用 4x4 超采样抗锯齿
const inside = (x, y) => {
  const nx = Math.min(Math.max(x, R), SIZE - 1 - R)
  const ny = Math.min(Math.max(y, R), SIZE - 1 - R)
  const dx = x - nx
  const dy = y - ny
  if (dx === 0 || dy === 0) return true // 直边区域
  return dx * dx + dy * dy <= R * R
}

const pixels = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let hit = 0
    for (let sy = 0; sy < 4; sy++) {
      for (let sx = 0; sx < 4; sx++) {
        if (inside(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hit++
      }
    }
    const i = (y * SIZE + x) * 4
    pixels[i] = raw[i]
    pixels[i + 1] = raw[i + 1]
    pixels[i + 2] = raw[i + 2]
    pixels[i + 3] = Math.round((raw[i + 3] * hit) / 16) // alpha 乘以圆角覆盖率
  }
}

// --- PNG 编码（filter 0 逐行） ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // 位深
ihdr[9] = 6 // RGBA
const scanlines = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  scanlines[y * (SIZE * 4 + 1)] = 0 // filter type 0
  pixels.copy(scanlines, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(scanlines, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
writeFileSync(outPath, png)
console.log(`written: ${outPath} (${png.length} bytes)`)
