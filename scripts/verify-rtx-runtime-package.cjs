'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RTX_RUNTIME_FILES = ['tatakai-rtx-video.exe', 'nvngx_vsr.dll', 'NVIDIA_RTX_Video_SDK_License.pdf', 'THIRD_PARTY_NOTICES.txt', 'nlohmann-json-LICENSE.MIT'];
function verifyRtxRuntimePackage(resources) {
  const directory = path.join(resources, 'bin', 'rtx-video');
  for (const name of RTX_RUNTIME_FILES) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file) || !fs.statSync(file).size) throw new Error(`RTX Video package is incomplete: missing ${name}`);
    if (/\.(exe|dll)$/.test(name)) {
      const signature = Buffer.alloc(2);
      const descriptor = fs.openSync(file, 'r');
      try { fs.readSync(descriptor, signature, 0, 2, 0); } finally { fs.closeSync(descriptor); }
      if (signature.toString() !== 'MZ') throw new Error(`RTX Video package has an invalid Windows binary: ${name}`);
    }
  }
}
module.exports = { verifyRtxRuntimePackage, RTX_RUNTIME_FILES };
