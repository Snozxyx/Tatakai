'use strict';
const fs = require('fs');
/** Windows scanners can briefly hold a just-written journal open. */
function renameAtomic(from, to) {
    for (let attempt = 0; ; attempt++) {
        try { fs.renameSync(from, to); return; }
        catch (error) {
            if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        }
    }
}
function writeAtomic(file, text) {
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, text);
    renameAtomic(temporary, file);
}
module.exports = { renameAtomic, writeAtomic };
