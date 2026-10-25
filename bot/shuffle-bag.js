'use strict';

/**
 * A shuffle-bag: every entry is served once before any entry is served again,
 * and the first pick of a new round is never the last pick of the previous round.
 * `rng` is injectable (returns [0,1)) so tests can be deterministic.
 */
function createShuffleBag(items, rng = Math.random) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('createShuffleBag needs a non-empty array');
  }
  let queue = [];
  let last = null;

  function refill() {
    queue = items.slice();
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    // Avoid an immediate repeat across the round boundary.
    if (items.length > 1 && queue[queue.length - 1] === last) {
      const swapWith = Math.floor(rng() * (queue.length - 1));
      const lastIdx = queue.length - 1;
      [queue[lastIdx], queue[swapWith]] = [queue[swapWith], queue[lastIdx]];
    }
  }

  return {
    next() {
      if (queue.length === 0) refill();
      last = queue.pop();
      return last;
    },
  };
}

module.exports = { createShuffleBag };
