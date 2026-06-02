const fs = require('fs');

const path = 'src/engine/PlaybackEngine.ts';
let code = fs.readFileSync(path, 'utf-8');

// The fundamental issue is that snap items have dur = 0.
// So itemEnd = accumulatedMs.
// `elapsedMs >= accumulatedMs` will be true as time passes.
// WAIT. If elapsedMs is 60.1s and accumulatedMs is 60.0.
// `60.1 >= 60.0` is true. So the condition `if (elapsedMs >= accumulatedMs && !this.snapsPlayed.has(snapKey))`
// evaluates to TRUE.
// So why doesn't it play?
// OH! LOOK AT THIS LINE:
// const snapKey = Math.round(accumulatedMs);
// Wait, is snapKey unique? If there are multiple snaps at the same accumulatedMs?
// No, the compiler only inserts them interleaved.
// The problem is that we are calling `this.playSnap();`
// BUT `elapsedMs >= accumulatedMs` is ALWAYS true after that time has passed.
// So it plays it ONCE. This is correct.
// So why doesn't `playSnap` make a sound?
// Let's check `playSnap` method.
