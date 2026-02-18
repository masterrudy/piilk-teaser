// types/global.d.ts
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    ttq?: { track: (...args: any[]) => void };
  }
}

export {};
