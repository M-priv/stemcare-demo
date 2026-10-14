// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdownToSafeHtml } from '../lib/markdown';

describe('renderMarkdownToSafeHtml — markdown features survive', () => {
  it('renders headings, bold, and lists from the clinical briefing', () => {
    const html = renderMarkdownToSafeHtml(
      '## Chief Complaint\nSore throat\n\n- **Onset**: 3 days\n- **Severity**: moderate',
    );
    expect(html).toContain('<h2>');
    expect(html).toContain('<strong>Onset</strong>');
    expect(html).toContain('<li>');
  });
});

describe('renderMarkdownToSafeHtml — XSS hardening (visitor-typed text reaches reports)', () => {
  it.each([
    ['inline script', '<script>alert(1)</script>'],
    ['event handler', '<img src=x onerror=alert(1)>'],
    ['javascript link', '[click me](javascript:alert(1))'],
    ['iframe injection', '<iframe src="https://evil.example"></iframe>'],
    ['svg onload', '<svg onload=alert(1)></svg>'],
    ['event handler in bold', '**<b onmouseover=alert(1)>hi</b>**'],
  ])('strips dangerous payload: %s', (_name, payload) => {
    const html = renderMarkdownToSafeHtml(
      `## Chief Complaint\nPatient reports: ${payload}`,
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror|onmouseover|onload=/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/<svg/i);
  });

  it('renders benign inline formatting from patient text without executing it', () => {
    const html = renderMarkdownToSafeHtml('Patient notes: it hurts <em>a lot</em> when moving');
    expect(html).toContain('<em>a lot</em>');
  });
});
