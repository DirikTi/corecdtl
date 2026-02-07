import { runBenchmark, hypernode } from "./utils.js";

const { CPool } = hypernode;

const pool = new CPool();
pool.initializePool(1024);

// register dummy objects
for (let i = 0; i < 1024; i++) {
  pool.registerObj({ id: i });
}

// --- allocate only
runBenchmark(
  "CPool allocate (hot)",
  () => {
    const obj = pool.allocate();
    if (obj !== null) pool.free(obj.id);
  },
  500_000
);

// --- allocate burst
runBenchmark(
  "CPool allocate burst 16",
  () => {
    const idxs = [];
    for (let i = 0; i < 16; i++) {
      const obj = pool.allocate();
      if (obj !== null) idxs.push(obj.id);
    }
    for (const id of idxs) pool.free(id);
  },
  100_000
);
