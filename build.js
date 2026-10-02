import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, 'dist');
const postsDir = path.join(root, 'content', 'posts');
const filesDir = path.join(root, 'content', 'files');
const assetsDir = path.join(root, 'assets');
const templatePath = path.join(root, 'templates', 'page.html');

const SITE_NAME = '馨苒';

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

function loadPosts() {
  if (!fs.existsSync(postsDir)) return [];
  return fs.readdirSync(postsDir)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const raw = fs.readFileSync(path.join(postsDir, file), 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      return {
        slug: file.replace(/\.md$/, ''),
        title: meta.title || file.replace(/\.md$/, ''),
        date: meta.date || '',
        html: marked.parse(body),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function loadFiles() {
  if (!fs.existsSync(filesDir)) return [];
  return fs.readdirSync(filesDir)
    .map((name) => ({ name, stat: fs.statSync(path.join(filesDir, name)) }))
    .filter((f) => f.stat.isFile())
    .map((f) => ({ name: f.name, size: f.stat.size }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const template = fs.readFileSync(templatePath, 'utf8');

function renderPage({ title, content, base }) {
  return template
    .replaceAll('{{title}}', escapeHtml(title))
    .replaceAll('{{base}}', base)
    .replaceAll('{{site_name}}', escapeHtml(SITE_NAME))
    .replaceAll('{{content}}', content);
}

function renderIndex(posts, files) {
  const postItems = posts.map((p) => `
      <li>
        <a href="posts/${encodeURIComponent(p.slug)}.html">${escapeHtml(p.title)}</a>
        ${p.date ? `<time>${escapeHtml(p.date)}</time>` : ''}
      </li>`).join('');
  const fileItems = files.slice(0, 5).map((f) => `
      <li class="file-row">
        <span class="file-ext">${escapeHtml(path.extname(f.name).slice(1).toUpperCase() || '文件')}</span>
        <a href="downloads/${encodeURIComponent(f.name)}" download>${escapeHtml(f.name)}</a>
        <span class="file-size">${formatSize(f.size)}</span>
      </li>`).join('');

  return `
  <section>
    <h2>文章</h2>
    ${posts.length ? `<ul class="post-list">${postItems}</ul>` : '<p class="muted">还没有文章。</p>'}
  </section>
  <section>
    <h2>文件下载</h2>
    ${files.length ? `<ul class="file-list">${fileItems}</ul>
    <p><a href="downloads.html">查看全部文件 →</a></p>` : '<p class="muted">还没有共享文件。</p>'}
  </section>`;
}

function renderPost(post) {
  return `
  <article class="post">
    <h1>${escapeHtml(post.title)}</h1>
    ${post.date ? `<time>${escapeHtml(post.date)}</time>` : ''}
    <div class="post-body">${post.html}</div>
  </article>`;
}

function renderDownloads(files) {
  const rows = files.map((f) => `
      <li class="file-row">
        <span class="file-ext">${escapeHtml(path.extname(f.name).slice(1).toUpperCase() || '文件')}</span>
        <a href="downloads/${encodeURIComponent(f.name)}" download>${escapeHtml(f.name)}</a>
        <span class="file-size">${formatSize(f.size)}</span>
      </li>`).join('');
  return `
  <section>
    <h1>文件下载</h1>
    ${files.length ? `<ul class="file-list">${rows}</ul>` : '<p class="muted">还没有共享文件。</p>'}
  </section>`;
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(path.join(distDir, 'posts'), { recursive: true });

const posts = loadPosts();
const files = loadFiles();

fs.writeFileSync(
  path.join(distDir, 'index.html'),
  renderPage({ title: '首页', content: renderIndex(posts, files), base: '' }),
);
for (const post of posts) {
  fs.writeFileSync(
    path.join(distDir, 'posts', `${post.slug}.html`),
    renderPage({ title: post.title, content: renderPost(post), base: '../' }),
  );
}
fs.writeFileSync(
  path.join(distDir, 'downloads.html'),
  renderPage({ title: '文件下载', content: renderDownloads(files), base: '' }),
);

if (fs.existsSync(filesDir)) {
  fs.cpSync(filesDir, path.join(distDir, 'downloads'), { recursive: true });
} else {
  fs.mkdirSync(path.join(distDir, 'downloads'), { recursive: true });
}
fs.copyFileSync(path.join(root, 'templates', 'style.css'), path.join(distDir, 'style.css'));
if (fs.existsSync(assetsDir)) {
  fs.cpSync(assetsDir, path.join(distDir, 'assets'), { recursive: true });
}

console.log(`构建完成：${posts.length} 篇文章，${files.length} 个文件 → ${distDir}`);
