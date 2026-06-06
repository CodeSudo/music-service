// This file MUST be CommonJS (.cjs) so require() calls happen synchronously
// in the order written. ES module imports are hoisted — by the time any patch
// runs in an .js file ytdl-core has already captured the original fs.writeFile.
//
// Load order here is guaranteed:
//   1. Patch fs.writeFile to no-op ytdl debug file writes (EROFS on Vercel)
//   2. Only then require ytdl-core, so it sees the patched fs throughout

const fs = require("fs");
const origWriteFile = fs.writeFile.bind(fs);

fs.writeFile = function patchedWriteFile(path, data, options, cb) {
  const p = String(path);
  if (
    p.endsWith("-watch.html") ||
    p.endsWith("-base.js") ||
    p.endsWith("-player.js")
  ) {
    // Silently succeed — ytdl debug file, not needed on Vercel
    const done = typeof options === "function" ? options : cb;
    if (typeof done === "function") done(null);
    return;
  }
  return origWriteFile(path, data, options, cb);
};

// Now safe to load ytdl-core
const ytdl = require("@distube/ytdl-core");
module.exports = ytdl;
