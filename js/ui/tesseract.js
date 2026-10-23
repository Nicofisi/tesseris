// A tesseract (4D cube) slowly turning through the fourth dimension, drawn on a small canvas.
const COLORS = ['#ff6f91', '#ffc94d', '#36cfe0', '#9b7bff']; // edge along x, y, z, w

export function mountTesseract(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth || 96;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const verts = [];
  for (let i = 0; i < 16; i++) verts.push([0, 1, 2, 3].map((b) => ((i >> b) & 1 ? 1 : -1)));
  const edges = [];
  for (let i = 0; i < 16; i++)
    for (let b = 0; b < 4; b++) {
      const j = i ^ (1 << b);
      if (j > i) edges.push([i, j, b]);
    }
  const start = performance.now();
  const frame = (now) => {
    if (!canvas.isConnected) return;
    const t = (now - start) / 1000;
    const a = t * 0.55, c = t * 0.31, e = 0.45 + Math.sin(t * 0.2) * 0.15;
    const pts = verts.map(([x, y, z, w]) => {
      // Turn in the x–w and y–z planes (a double rotation), then tilt for a nicer angle.
      [x, w] = [x * Math.cos(a) - w * Math.sin(a), x * Math.sin(a) + w * Math.cos(a)];
      [y, z] = [y * Math.cos(c) - z * Math.sin(c), y * Math.sin(c) + z * Math.cos(c)];
      [y, z] = [y * Math.cos(e) - z * Math.sin(e), y * Math.sin(e) + z * Math.cos(e)];
      const k4 = 2.6 / (3.2 - w);
      [x, y, z] = [x * k4, y * k4, z * k4];
      const k3 = 3.4 / (5.5 - z);
      return { x: x * k3, y: y * k3, depth: z + w };
    });
    const s = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    const sorted = edges.slice().sort((p, q) => pts[p[0]].depth + pts[p[1]].depth - pts[q[0]].depth - pts[q[1]].depth);
    for (const [i, j, b] of sorted) {
      const p = pts[i], q = pts[j];
      const x1 = s + p.x * s * 0.68, y1 = s - p.y * s * 0.68, x2 = s + q.x * s * 0.68, y2 = s - q.y * s * 0.68;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 6 * dpr;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = COLORS[b];
      ctx.lineWidth = 3 * dpr;
      ctx.stroke();
    }
    for (const p of pts) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s + p.x * s * 0.68, s - p.y * s * 0.68, 3.2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
