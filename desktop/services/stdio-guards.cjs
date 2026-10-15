'use strict';

// An AppImage may outlive its launching terminal. Losing that terminal's
// logging pipe must not kill playback or the local proxy.
function installStdioGuards(streams = [process.stdout, process.stderr]) {
  for (const stream of streams) {
    if (!stream || stream.__tatakaiStdioGuard) continue;
    stream.__tatakaiStdioGuard = true;
    stream.on('error', error => {
      if (error?.code === 'EPIPE' || error?.code === 'ERR_STREAM_DESTROYED') return;
      throw error;
    });
  }
}
module.exports = { installStdioGuards };
