// @vitest-environment jsdom
/**
 * Provenance citations: [[n]] markers in the live report must become
 * hoverable sup.demo-cite nodes carrying the verbatim patient quote, and
 * must never become an XSS vector — the quote is patient-typed text.
 */

import { describe, expect, it } from 'vitest';
import {
  renderReportMarkdownToSafeHtml,
  renderMarkdownToSafeHtml,
  type ReportCitationSource,
} from '../lib/markdown';

const sources: ReportCitationSource[] = [
  { index: 1, quote: 'I have a really bad headache, usually on one side', isPatient: true },
  { index: 2, quote: 'Any chest pain or shortness of breath?', isPatient: false },
  { index: 3, quote: 'Bright lights really bother my eyes', isPatient: true },
];

describe('renderReportMarkdownToSafeHtml', () => {
  it('converts a resolvable patient citation into a hoverable cite node with the verbatim quote', () => {
    const html = renderReportMarkdownToSafeHtml(
      '- **Location**: Unilateral [[1]]',
      sources,
    );
    expect(html).toContain('sup class="demo-cite"');
    expect(html).toContain('data-msg-index="1"');
    expect(html).toContain('demo-cite__tip');
    expect(html).toContain('really bad headache');
  });

  it('renders multiple adjacent markers', () => {
    const html = renderReportMarkdownToSafeHtml('Combined finding [[1]][[3]]', sources);
    expect(html.match(/<sup class="demo-cite"/g)?.length).toBe(2);
  });

  it('drops markers that cite a clinician line', () => {
    const html = renderReportMarkdownToSafeHtml('Finding [[2]]', sources);
    expect(html).not.toContain('demo-cite');
    expect(html).not.toContain('[[2]]');
  });

  it('drops out-of-range and malformed markers', () => {
    const html = renderReportMarkdownToSafeHtml('A [[9]] B [[99]] C [[x]] D [[ 1 ]] E', sources);
    expect(html).not.toContain('demo-cite');
    expect(html).not.toContain('[[9]]');
  });

  it('strips all markers when no sources are provided (deterministic reports)', () => {
    const html = renderReportMarkdownToSafeHtml('Finding [[1]] with no sources', []);
    expect(html).not.toContain('demo-cite');
    expect(html).not.toContain('[[1]]');
    expect(html).toContain('Finding');
    expect(html).toContain('with no sources');
  });

  it('never lets a hostile quote become live markup', () => {
    const hostile: ReportCitationSource[] = [
      { index: 1, quote: '<img src=x onerror=alert(1)> "quoted" & <script>bad()</script>', isPatient: true },
    ];
    const html = renderReportMarkdownToSafeHtml('Finding [[1]]', hostile);
    // No raw tags may survive anywhere in the serialized output.
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    // The quote still reaches the tooltip as inert, escaped text.
    expect(html).toContain('demo-cite__tip');
    expect(html).toContain('alert(1)');
    expect(html).toContain('data-msg-index="1"');
  });

  it('truncates very long quotes', () => {
    const long: ReportCitationSource[] = [
      { index: 1, quote: 'x'.repeat(500), isPatient: true },
    ];
    const html = renderReportMarkdownToSafeHtml('Finding [[1]]', long);
    expect(html).toContain('…');
    expect(html.length).toBeLessThan(1000);
  });

  it('leaves plain markdown without markers untouched', () => {
    const md = '## Chief Complaint\nHeadache';
    expect(renderReportMarkdownToSafeHtml(md, sources)).toBe(
      renderMarkdownToSafeHtml(md),
    );
  });
});
