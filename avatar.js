// Real-avatar helper shared by guest-facing pages.
// Gravatar returns a real profile photo when the guest has one and falls back
// to a consistent initials avatar when the email has no public photo.
(function () {
  function rotateLeft(value, amount) {
    return (value << amount) | (value >>> (32 - amount));
  }

  function addUnsigned(a, b) {
    return (a + b) & 0xffffffff;
  }

  function md5(input) {
    const bytes = unescape(encodeURIComponent(input));
    const words = [];
    for (let i = 0; i < bytes.length; i++) {
      words[i >> 2] = (words[i >> 2] || 0) | (bytes.charCodeAt(i) << ((i % 4) * 8));
    }
    const bitLength = bytes.length * 8;
    words[bitLength >> 5] = (words[bitLength >> 5] || 0) | (0x80 << (bitLength % 32));
    words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;
    const k = [
      -680876936, -389564586, 606105819, -1044525330, -176418897,
      1200080426, -1473231341, -45705983, 1770035416, -1958414417,
      -42063, -1990404162, 1804603682, -40341101, -1502002290,
      1236535329, -165796510, -1069501632, 643717713, -373897302,
      -701558691, 38016083, -660478335, -405537848, 568446438,
      -1019803690, -187363961, 1163531501, -1444681467, -51403784,
      1735328473, -1926607734, -378558, -2022574463, 1839030562,
      -35309556, -1530992060, 1272893353, -155497632, -1094730640,
      681279174, -358537222, -722521979, 76029189, -640364487,
      -421815835, 530742520, -995338651, -198630844, 1126891415,
      -1416354905, -57434055, 1700485571, -1894986606, -1051523,
      -2054922799, 1873313359, -30611744, -1560198380, 1309151649,
      -145523070, -1120210379, 718787259, -343485551, 1502002290,
      -1926607734, -378558, -1094730640, 681279174, -358537222,
      -722521979, 76029189, -640364487, -421815835, 530742520,
      -995338651, -198630844, 1126891415, -1416354905, -57434055,
      1700485571, -1894986606, -1051523, -2054922799, 1873313359,
      -30611744, -1560198380, 1309151649, -145523070, -1120210379,
      718787259, -343485551, 1502002290, -1926607734, -378558,
      -1094730640, 681279174, -358537222, -722521979, 76029189,
      -640364487, -421815835, 530742520, -995338651, -198630844,
      1126891415, -1416354905, -57434055, 1700485571, -1894986606,
      -1051523, -2054922799, 1873313359, -30611744, -1560198380,
      1309151649, -145523070, -1120210379, 718787259, -343485551
    ];
    const shifts = [
      7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21
    ];

    for (let offset = 0; offset < words.length; offset += 16) {
      const oldA = a, oldB = b, oldC = c, oldD = d;
      for (let i = 0; i < 64; i++) {
        let f, index;
        if (i < 16) {
          f = (b & c) | (~b & d);
          index = i;
        } else if (i < 32) {
          f = (d & b) | (~d & c);
          index = (5 * i + 1) % 16;
        } else if (i < 48) {
          f = b ^ c ^ d;
          index = (3 * i + 5) % 16;
        } else {
          f = c ^ (b | ~d);
          index = (7 * i) % 16;
        }
        const round = Math.floor(i / 16);
        const shift = shifts[(round * 4) + (i % 4)];
        const temp = d;
        d = c;
        c = b;
        const sum = addUnsigned(addUnsigned(addUnsigned(a, f), k[i]), words[offset + index] || 0);
        b = addUnsigned(b, rotateLeft(sum, shift));
        a = temp;
      }
      a = addUnsigned(a, oldA);
      b = addUnsigned(b, oldB);
      c = addUnsigned(c, oldC);
      d = addUnsigned(d, oldD);
    }

    return [a, b, c, d].map(value => {
      let output = '';
      for (let i = 0; i < 4; i++) output += (`0${(value >>> (i * 8) & 0xff).toString(16)}`).slice(-2);
      return output;
    }).join('');
  }

  window.buildRealAvatar = function (name, email, size = 100) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || 'Guest').trim() || 'Guest';
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&size=${size}&background=800000&color=fff&rounded=true&bold=true`;
    if (!cleanEmail || !cleanEmail.includes('@')) return fallback;
    return `https://www.gravatar.com/avatar/${md5(cleanEmail)}?s=${size}&d=${encodeURIComponent(fallback)}`;
  };
})();
