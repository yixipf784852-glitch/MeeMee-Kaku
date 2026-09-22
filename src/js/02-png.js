/* ════════ 二、PNG 读写 ════════ */

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TBL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b, s = 0, e = b.length) {
  let c = 0xffffffff;
  for (let i = s; i < e; i++) c = CRC_TBL[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function readChunks(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 8 || PNG_SIGNATURE.some((v, i) => bytes[i] !== v)) throw new Error('这不是 PNG 文件');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    out = [];
  let p = 8,
    ended = false;
  while (p < bytes.length) {
    if (bytes.length - p < 12) throw new Error('PNG 数据块被截断');
    const len = dv.getUint32(p);
    if (len > bytes.length - p - 12) throw new Error('PNG 数据块长度超出文件');
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('PNG 数据块类型无效');
    if (dv.getUint32(p + 8 + len) !== crc32(bytes, p + 4, p + 8 + len))
      throw new Error('PNG ' + type + ' 数据块 CRC 校验失败');
    if (!out.length && (type !== 'IHDR' || len !== 13)) throw new Error('PNG 缺少有效的 IHDR');
    if (type === 'IHDR' && out.length) throw new Error('PNG 含重复 IHDR');
    out.push({ type, data: bytes.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
    if (type === 'IEND') {
      if (len !== 0) throw new Error('PNG IEND 长度无效');
      ended = true;
      break;
    }
  }
  if (!ended) throw new Error('PNG 缺少 IEND 结束块');
  if (p !== bytes.length) throw new Error('PNG IEND 后含多余数据');
  if (!out.some(c => c.type === 'IDAT')) throw new Error('PNG 缺少图像数据');
  return out;
}
function bytesToLatin1(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}
function latin1ToBytes(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}
function b64ToText(s) {
  return new TextDecoder('utf-8', { fatal: true }).decode(latin1ToBytes(atob(s.replace(/\s/g, ''))));
}
function textToB64(s) {
  return btoa(bytesToLatin1(new TextEncoder().encode(s)));
}
async function extractFromPng(bytes) {
  const found = { ccv3: [], chara: [] };
  let last;
  for (const c of readChunks(bytes)) {
    if (!['tEXt', 'zTXt'].includes(c.type)) continue;
    const z = c.data.indexOf(0);
    if (z < 1) continue;
    const key = bytesToLatin1(c.data.subarray(0, z));
    if (!(key in found)) continue;
    found[key].push(c);
  }
  const keys = Object.keys(found).filter(k => found[k].length);
  if (!keys.length) throw new Error('这张 PNG 里没有角色卡数据（缺 chara / ccv3 数据块）');
  for (const key of ['ccv3', 'chara'])
    for (const c of found[key].slice().reverse()) {
      try {
        const z = c.data.indexOf(0);
        let payload = c.data.subarray(z + 1);
        if (c.type === 'zTXt') {
          if (payload[0] !== 0) throw new Error('PNG zTXt 压缩方法无效');
          if (typeof DecompressionStream === 'undefined')
            throw new Error('当前浏览器不支持压缩卡数据，请用新版浏览器打开');
          const stream = new Blob([payload.subarray(1)]).stream().pipeThrough(new DecompressionStream('deflate'));
          const reader = stream.getReader(),
            chunks = [];
          let total = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > 64 * 1024 * 1024) {
              await reader.cancel();
              throw new Error('PNG 压缩卡数据超过 64 MB');
            }
            chunks.push(value);
          }
          payload = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            payload.set(chunk, offset);
            offset += chunk.length;
          }
        }
        const text = b64ToText(bytesToLatin1(payload));
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || (!parsed.data && !('name' in parsed)))
          throw new Error('卡数据缺少 data 或 name');
        normalize(parsed); // 有效 JSON 也可能是坏卡；候选必须能归一，才不挡住 chara 后备块。
        return { text, keys, selected: key };
      } catch (e) {
        last = e;
      }
    }
  throw new Error('卡数据解码失败：' + (last?.message || '未知错误'));
}
function writePngChunks(chunks) {
  const out = new Uint8Array(8 + chunks.reduce((n, c) => n + c.data.length + 12, 0));
  out.set(PNG_SIGNATURE);
  const dv = new DataView(out.buffer);
  let p = 8;
  for (const c of chunks) {
    dv.setUint32(p, c.data.length);
    out.set(latin1ToBytes(c.type), p + 4);
    out.set(c.data, p + 8);
    dv.setUint32(p + 8 + c.data.length, crc32(out, p + 4, p + 8 + c.data.length));
    p += c.data.length + 12;
  }
  return out;
}
function embedIntoPng(bytes, jsonText) {
  JSON.parse(jsonText);
  const payload = latin1ToBytes(textToB64(jsonText));
  const keep = readChunks(bytes).filter(c => {
    if (!['tEXt', 'zTXt', 'iTXt'].includes(c.type)) return true;
    const z = c.data.indexOf(0);
    return z < 0 || !['chara', 'ccv3'].includes(bytesToLatin1(c.data.subarray(0, z)));
  });
  const make = key => {
    const prefix = latin1ToBytes(key + '\0'),
      data = new Uint8Array(prefix.length + payload.length);
    data.set(prefix);
    data.set(payload, prefix.length);
    return { type: 'tEXt', data };
  };
  keep.splice(
    keep.findIndex(c => c.type === 'IDAT'),
    0,
    make('chara'),
    make('ccv3'),
  );
  return writePngChunks(keep);
}
