/// <reference types="chrome" />

interface Window {
  // App modules
  csPopup: any;
  csDock: any;
  panelContext: any;
  tabContextManager: any;
  chatSessionManager: any;

  // Utility functions
  truncate: (str: string | null | undefined, max: number) => string;
  hashUrl: (url: string | null | undefined) => string;
  i18n: (key: string) => string;
  copyToClipboard: (text: string) => Promise<boolean>;
  svgIcon: (name: string) => string;
  injectSprite: (spriteUrl: string) => Promise<void>;
  SVG: Record<string, string>;
}