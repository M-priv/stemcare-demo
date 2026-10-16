export const TOUR_STORAGE_KEY = 'stemcare_demo_tour_dismissed_v1';

/**
 * Checks whether the walkthrough tour should be automatically opened on page startup.
 * Defaults to true so first-time visitors and evaluators immediately see the tour.
 */
export function shouldShowTourOnStartup(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    return window.localStorage.getItem(TOUR_STORAGE_KEY) !== 'true';
  } catch {
    return true;
  }
}

/**
 * Updates the user's preference for whether to show the tour automatically on launch.
 */
export function setTourStartupDismissed(dismissed: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (dismissed) {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(TOUR_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[STEMCare Tour] Failed to update tour storage:', err);
  }
}
