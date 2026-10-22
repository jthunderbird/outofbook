// Where OutOfBook runs: the website, the Android app that opens the website
// (a Trusted Web Activity, started at /?app=android), or the Android app with
// the web app bundled inside (Capacitor, built with VITE_TARGET=capacitor).
export const IS_CAPACITOR = import.meta.env.VITE_TARGET === "capacitor";

function fromTwa() {
  try {
    if (new URLSearchParams(location.search).get("app") === "android") localStorage.setItem("platform", "twa");
    return localStorage.getItem("platform") === "twa" || document.referrer.startsWith("android-app://");
  } catch {
    return false;
  }
}
export const IS_TWA = !IS_CAPACITOR && fromTwa();
/** Either Android app. Claude answers are left out of the apps. */
export const IN_APP = IS_CAPACITOR || IS_TWA;

/** The API's origin: the same as the page's, except in the bundled app, which talks to the public server. */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";
