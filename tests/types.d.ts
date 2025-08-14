// Custom Jest matchers type declarations
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidRule(): R;
      toBeValidAIResponse(): R;
    }
  }
}

export {};
