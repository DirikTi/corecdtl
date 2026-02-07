// Native Addon
import bindings from "bindings";

export const hypernode = bindings("hypernode");

export function nowNs() {
  return process.hrtime.bigint();
}

export function diffNs(start, end) {
  return Number(end - start);
}

export function warmup(fn, iters = 10_000) {
  for (let i = 0; i < iters; i++) fn();
}

export function runBenchmark(name, fn, iters) {
  warmup(fn);

  const start = nowNs();
  for (let i = 0; i < iters; i++) fn();
  const end = nowNs();

  const totalNs = diffNs(start, end);
  const avgNs = totalNs / iters;

  console.log(
    `${name}: total=${totalNs.toLocaleString()} ns | avg=${avgNs.toFixed(2)} ns`
  );
}
