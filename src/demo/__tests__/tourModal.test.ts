// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  TOUR_STORAGE_KEY,
  shouldShowTourOnStartup,
  setTourStartupDismissed,
} from '../lib/tourStorage';
import { TOUR_SLIDES } from '../components/DemoTourModal';

describe('Tour Storage & Startup Preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to opening on startup when localStorage has no entry', () => {
    expect(shouldShowTourOnStartup()).toBe(true);
  });

  it('returns false when tour has been marked as dismissed', () => {
    setTourStartupDismissed(true);
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('true');
    expect(shouldShowTourOnStartup()).toBe(false);
  });

  it('can re-enable startup tour when setTourStartupDismissed(false) is called', () => {
    setTourStartupDismissed(true);
    expect(shouldShowTourOnStartup()).toBe(false);

    setTourStartupDismissed(false);
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
    expect(shouldShowTourOnStartup()).toBe(true);
  });
});

describe('Tour Slides Content & Structure', () => {
  it('defines 8 comprehensive steps', () => {
    expect(TOUR_SLIDES).toHaveLength(8);
  });

  it('has all required slide IDs in chronological order', () => {
    const expectedIds = [
      'welcome',
      'scenarios',
      'custom_case',
      'autoplay',
      'reset',
      'interview',
      'briefing',
      'clinician_gate',
    ];
    expect(TOUR_SLIDES.map((s) => s.id)).toEqual(expectedIds);
  });

  it('every slide contains valid titles, subtitles, and key points', () => {
    TOUR_SLIDES.forEach((slide, idx) => {
      expect(slide.id).toBeTruthy();
      expect(slide.title.length).toBeGreaterThan(3);
      expect(slide.subtitle.length).toBeGreaterThan(5);
      expect(slide.points.length).toBeGreaterThanOrEqual(2);
      expect(slide.badge).toContain(`${idx + 1} of 8`);
    });
  });

  it('covers the 4 benchmark conditions in the scenarios step', () => {
    const scenariosSlide = TOUR_SLIDES.find((s) => s.id === 'scenarios');
    expect(scenariosSlide).toBeDefined();
    const joinedPoints = scenariosSlide!.points.join(' ');
    expect(joinedPoints).toContain('Migraine');
    expect(joinedPoints).toContain('Influenza');
    expect(joinedPoints).toContain('Malaria');
    expect(joinedPoints).toContain('Serotonin Syndrome');
  });

  it('explains the Custom Case capability clearly', () => {
    const customSlide = TOUR_SLIDES.find((s) => s.id === 'custom_case');
    expect(customSlide).toBeDefined();
    const joinedPoints = customSlide!.points.join(' ');
    expect(joinedPoints.toLowerCase()).toContain('custom case');
    expect(joinedPoints.toLowerCase()).toContain('patient details');
  });

  it('explains Auto-Play hands-free simulation clearly', () => {
    const autoPlaySlide = TOUR_SLIDES.find((s) => s.id === 'autoplay');
    expect(autoPlaySlide).toBeDefined();
    const joinedPoints = autoPlaySlide!.points.join(' ');
    expect(joinedPoints.toLowerCase()).toContain('auto-play');
    expect(joinedPoints.toLowerCase()).toContain('simulator');
  });

  it('explains Reset to Turn 1 clearly', () => {
    const resetSlide = TOUR_SLIDES.find((s) => s.id === 'reset');
    expect(resetSlide).toBeDefined();
    const joinedPoints = resetSlide!.points.join(' ');
    expect(joinedPoints.toLowerCase()).toContain('reset');
    expect(joinedPoints.toLowerCase()).toContain('start');
  });

  it('specifies the correct mobile tab synchronization for each slide', () => {
    // Steps 1-6 are centered, header, or chat
    for (let i = 0; i <= 5; i++) {
      expect(TOUR_SLIDES[i].mobileTab).toBe('chat');
    }
    // Steps 7-8 target the clinical report and clinician gate
    expect(TOUR_SLIDES[6].mobileTab).toBe('report');
    expect(TOUR_SLIDES[7].mobileTab).toBe('report');
  });

  it('assigns specific data-tour targets to relevant steps', () => {
    const scenarios = TOUR_SLIDES.find((s) => s.id === 'scenarios');
    expect(scenarios?.targetSelector).toContain('scenario-selector');

    const custom = TOUR_SLIDES.find((s) => s.id === 'custom_case');
    expect(custom?.targetSelector).toContain('scenario-selector');

    const autoplay = TOUR_SLIDES.find((s) => s.id === 'autoplay');
    expect(autoplay?.targetSelector).toContain('autoplay-btn');

    const reset = TOUR_SLIDES.find((s) => s.id === 'reset');
    expect(reset?.targetSelector).toContain('reset-btn');

    const interview = TOUR_SLIDES.find((s) => s.id === 'interview');
    expect(interview?.targetSelector).toContain('chat-pane');

    const briefing = TOUR_SLIDES.find((s) => s.id === 'briefing');
    expect(briefing?.targetSelector).toContain('report-pane');

    const clinicianGate = TOUR_SLIDES.find((s) => s.id === 'clinician_gate');
    expect(clinicianGate?.targetSelector).toContain('clinician-tabs');
  });
});
