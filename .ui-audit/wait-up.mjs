const wait = async (url, label, deadlineMs) => {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) { console.log(label, 'UP', r.status); return true; } } catch { }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.log(label, 'TIMEOUT');
  return false;
};
await wait('http://127.0.0.1:4001/api/health', 'API(4001)', 240000);
await wait('http://localhost:5173/', 'VITE(5173)', 180000);
