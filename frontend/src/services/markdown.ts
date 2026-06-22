import { marked } from 'marked';
import DOMPurify from 'dompurify';

const renderer = new marked.Renderer();

// Code blocks: wrap in container with language header + copy button
renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
  const language = lang || 'text';
  const escaped = text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
  return `<div class="code-block">
    <div class="code-header">
      <span class="code-lang">${language}</span>
      <button class="code-copy-btn" data-code aria-label="Copy code">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>
    </div>
    <pre><code>${escaped}</code></pre>
  </div>`;
};

marked.setOptions({ breaks: true, gfm: true, renderer });

export function renderMarkdown(text: string): string {
  let html = marked.parse(text) as string;

  // Post-process: convert [Source: ...] into citation badges
  html = html.replace(
    /\[Source:\s*([^\]]+)\]/g,
    (_match, p1: string) => {
      const safe = DOMPurify.sanitize(p1);
      return `<span class="source-citation" title="${safe}">${safe}</span>`;
    }
  );

  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['details', 'summary', 'button', 'span'],
    ADD_ATTR: ['data-code', 'open'],
  });
}

// Global click handler for code copy buttons (delegation)
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.code-copy-btn');
    if (!btn) return;
    const block = btn.closest('.code-block');
    if (!block) return;
    const code = block.querySelector('code');
    if (!code) return;
    navigator.clipboard.writeText(code.textContent || '').then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied';
      setTimeout(() => { btn.innerHTML = orig; }, 2000);
    });
  });
}
