let topKey: T | null = null;
let topVal = -1;

m.forEach((v, k) => {
  if (v > topVal) {
    topVal = v;
    topKey = k;
  }
});

return topKey;
