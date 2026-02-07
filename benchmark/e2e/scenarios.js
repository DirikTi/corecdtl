export const scenarios = [
  {
    name: "low_concurrency",
    connections: 10,
    pipelining: 1,
    duration: 20,
  },
  {
    name: "medium_concurrency",
    connections: 50,
    pipelining: 1,
    duration: 20,
  },
  {
    name: "high_concurrency",
    connections: 100,
    pipelining: 1,
    duration: 20,
  },
];
