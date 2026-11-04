/**
 * 依存ライブラリなしで zip を読む最小実装（researchmap のエクスポート zip 用）。
 * - 圧縮方式: 無圧縮(0) / deflate(8)
 * - 暗号化: 従来型 ZipCrypto（researchmap のエクスポートはこれ）。AES 暗号化には対応しない。
 * 展開結果はファイルに書き出さず、メモリ上で返す。
 */
import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32Byte = (crc, b) => (CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crc32Byte(c, b)
  return (c ^ 0xffffffff) >>> 0
}

function zipCryptoDecrypt(data, password) {
  let k0 = 0x12345678, k1 = 0x23456789, k2 = 0x34567890
  const update = (b) => {
    k0 = crc32Byte(k0, b)
    k1 = (Math.imul((k1 + (k0 & 0xff)) >>> 0, 134775813) + 1) >>> 0
    k2 = crc32Byte(k2, k1 >>> 24)
  }
  for (const b of Buffer.from(password, 'utf8')) update(b)
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) {
    const t = (k2 | 2) & 0xffff
    const c = data[i] ^ ((Math.imul(t, t ^ 1) >>> 8) & 0xff)
    out[i] = c
    update(c)
  }
  return out
}

export class ZipPasswordError extends Error {}

/**
 * @param {Buffer} buf zip ファイルの中身
 * @param {() => Promise<string>} getPassword 暗号化エントリがあったときだけ呼ばれる
 * @returns {Promise<{name: string, data: Buffer}[]>}
 */
export async function readZip(buf, getPassword) {
  // End of Central Directory を末尾から探す
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0xffff - 22); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip ファイルとして読めません')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)

  let password
  const entries = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip の中央ディレクトリが壊れています')
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const modTime = buf.readUInt16LE(p + 12)
    const crc = buf.readUInt32LE(p + 16)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1')
    p += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/')) continue

    const lNameLen = buf.readUInt16LE(local + 26)
    const lExtraLen = buf.readUInt16LE(local + 28)
    let data = buf.subarray(local + 30 + lNameLen + lExtraLen, local + 30 + lNameLen + lExtraLen + csize)

    if (flags & 0x1) {
      if (method === 99) throw new Error(`${name}: AES 暗号化の zip には対応していません。展開してからフォルダを指定してください`)
      password ??= await getPassword()
      const plain = zipCryptoDecrypt(data, password)
      // 暗号ヘッダ12バイトの最終バイトは CRC（データ記述子ありなら更新時刻）の上位バイト
      const check = flags & 0x8 ? (modTime >>> 8) & 0xff : crc >>> 24
      if (plain[11] !== check) throw new ZipPasswordError('zip のパスワードが違います')
      data = plain.subarray(12)
    }
    if (method === 8) data = zlib.inflateRawSync(data)
    else if (method !== 0) throw new Error(`${name}: 未対応の圧縮方式です (${method})`)
    if (crc32(data) !== crc) throw new ZipPasswordError(`${name}: 展開結果が壊れています（パスワード違いの可能性）`)
    entries.push({ name, data })
  }
  return entries
}
