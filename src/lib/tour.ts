const TOUR_SEEN_KEY = "frangellboom:tourSeen";

/** Whether this device has already been through the welcome tour. Storage can
 *  throw (private browsing, blocked site data) — treated as seen then, so a
 *  broken storage never shows the tour on every launch. */
export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // storage unavailable — the tour just shows again next launch
  }
}
