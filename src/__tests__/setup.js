import '@testing-library/jest-dom';

// Silence React's act() warnings in tests
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Stub browser APIs not available in jsdom (guard for Node environment tests)
if (globalThis.window) {
  globalThis.window.speechSynthesis = {
    cancel: () => {},
    speak: () => {},
    getVoices: () => [],
    addEventListener: () => {},
  };
  globalThis.window.SpeechRecognition = undefined;
  globalThis.window.webkitSpeechRecognition = undefined;
}

// Stub ResizeObserver (used by recharts)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
