const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

function getMixinKey(original) {
  return MIXIN_KEY_ENC_TAB.map((index) => original[index]).join("").slice(0, 32);
}

function getImageKey(url) {
  const filename = url?.split("/").pop() || "";
  return filename.split(".")[0];
}

function encodeWbi(params, mixinKey) {
  const cleanParams = Object.fromEntries(
    Object.entries({ ...params, wts: Math.round(Date.now() / 1000) })
      .map(([key, value]) => [key, String(value).replace(/[!'()*]/g, "")])
      .sort(([left], [right]) => left.localeCompare(right))
  );
  const query = new URLSearchParams(cleanParams).toString();
  return `${query}&w_rid=${md5(`${query}${mixinKey}`)}`;
}

function md5(input) {
  const source = new TextEncoder().encode(input);
  const bitLength = source.length * 8;
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const lengthView = new DataView(bytes.buffer);
  lengthView.setUint32(paddedLength - 8, bitLength >>> 0, true);
  lengthView.setUint32(paddedLength - 4, Math.floor(bitLength / 0x1_0000_0000), true);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x1_0000_0000) | 0);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const words = Array.from({ length: 16 }, (_, index) => lengthView.getInt32(offset + index * 4, true));
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    for (let index = 0; index < 64; index += 1) {
      let f;
      let g;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const nextD = d;
      d = c;
      c = b;
      const rotated = leftRotate((a + f + constants[index] + words[g]) | 0, shifts[index]);
      b = (b + rotated) | 0;
      a = nextD;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
  }
  return [h0, h1, h2, h3].map(toLittleEndianHex).join("");
}

function leftRotate(value, amount) {
  return (value << amount) | (value >>> (32 - amount));
}

function toLittleEndianHex(value) {
  return [0, 8, 16, 24].map((shift) => ((value >>> shift) & 0xff).toString(16).padStart(2, "0")).join("");
}
