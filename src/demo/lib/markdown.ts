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

/**
 * Report provenance citations.
 *
 * The live report writer appends [[n]] markers referencing numbered patient
 * transcript lines. Each resolvable marker becomes a hoverable sup.demo-cite
 * whose hidden .demo-cite__tip child carries the verbatim patient quote as
 * TEXT (CSS tooltip) and whose data-msg-index carries the 1-based transcript
 * index (click-to-scroll). The quote deliberately lives in a text node, not
 * a data attribute: DOMPurify drops data attributes whose decoded value
 * contains markup-like content, which would silently kill tooltips on
 * quotes such as "the <script> tag". Markers that do not resolve to a
 * patient line — clinician-cited, out of range, or hallucinated — are
 * dropped rather than rendered. Deterministic reports contain no markers,
 * so they pass through untouched.
 */
export interface ReportCitationSource {
  index: number;
  quote: string;
  isPatient: boolean;
}

const CITATION_MARKER = /\[\[(\d{1,2})\]\]/g;
const MAX_QUOTE_CHARS = 240;

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // marked still parses markdown inside raw inline HTML, so neutralise
    // markdown-significant characters to keep the quote truly verbatim.
    .replace(/([\\`*_\[\]])/g, '\\$1')
    .replace(/\n+/g, ' ');
}

export function renderReportMarkdownToSafeHtml(
  markdown: string,
  sources: ReportCitationSource[],
): string {
  const byIndex = new Map(sources.map((s) => [s.index, s]));
  const withCitations = (markdown ?? '').replace(
    CITATION_MARKER,
    (_match, rawIndex: string) => {
      const source = byIndex.get(Number(rawIndex));
      if (!source || !source.isPatient || !source.quote) return '';
      // Truncate on code-point boundaries (a raw slice can split a surrogate
      // pair and corrupt the last character).
      const chars = Array.from(source.quote);
      const quote =
        chars.length > MAX_QUOTE_CHARS
          ? chars.slice(0, MAX_QUOTE_CHARS).join('').trimEnd() + '…'
          : source.quote;
      return (
        `<sup class="demo-cite" data-msg-index="${source.index}" tabindex="0">` +
        `<span class="demo-cite__tip" aria-hidden="true">“${escapeHtmlText(quote)}”</span>` +
        `${source.index}</sup>`
      );
    },
  );
  return renderMarkdownToSafeHtml(withCitations);
}
