// Minimal static server for the test harness. Dependency-free so it works the
// same everywhere: `node test/serve.mjs` then open http://localhost:8177/test/harness.html
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

createServer(async (req, res) => {
	// POST /_shot -> writes a base64 data URL body to test/shots/<name>.png, so
	// renders from a browser session can be pulled back out for inspection.
	if (req.method === 'POST' && req.url.startsWith('/_shot')) {
		const name = (new URL(req.url, 'http://localhost').searchParams.get('name') || 'shot').replace(/[^\w.-]/g, '');
		const chunks = [];
		for await (const c of req) chunks.push(c);
		const body = Buffer.concat(chunks).toString('utf8').replace(/^data:image\/\w+;base64,/, '');
		await mkdir(path.join(root, 'test', 'shots'), { recursive: true });
		await writeFile(path.join(root, 'test', 'shots', `${name}.png`), Buffer.from(body, 'base64'));
		res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }).end('ok');
		return;
	}
	if (req.method === 'OPTIONS') {
		res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,GET,OPTIONS' }).end();
		return;
	}

	const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
	const file = path.resolve(root, rel || 'test/harness.html');
	if (!file.startsWith(root)) {
		res.writeHead(403).end('forbidden');
		return;
	}
	try {
		const body = await readFile(file);
		res.writeHead(200, {
			'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
			'Cache-Control': 'no-store',
			// so the built plugin can be pulled into web.blockbench.net for testing
			'Access-Control-Allow-Origin': '*',
		});
		res.end(body);
	} catch {
		res.writeHead(404).end('not found');
	}
}).listen(8177, () => console.log('serving http://localhost:8177/test/harness.html'));
