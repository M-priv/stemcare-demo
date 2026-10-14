/**
 * Markdown rendering with sanitization.
 *
 * ALL demo markdown (clinical briefing, chat messages) passes through here
 * before it reaches `dangerouslySetInnerHTML`. Visitor-typed text flows into
 * report markdown, so raw `marked` output must never be rendered: `marked`
 * does not sanitize HTML by design, and DOMPurify strips dangerous constructs
 * (script/iframe/event handlers/javascript: URLs) from the rendered markup.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function renderMarkdownToSafeHtml(markdown: string): string {
  const html = marked.parse(markdown ?? '', { gfm: true, breaks: true }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_ATTR: ['style'],
  });
}
