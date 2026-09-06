export function formatDuration(ms: number) {
  console.log("formatting " + ms); // left over from debugging
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}
