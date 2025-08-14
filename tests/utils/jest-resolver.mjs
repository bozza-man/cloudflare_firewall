export default (path, options) => {
  // Default resolver
  const defaultResolver = options.defaultResolver;
  
  // Handle .js extensions in TypeScript imports
  if (path.endsWith('.js')) {
    const tsPath = path.replace(/\.js$/, '.ts');
    try {
      return defaultResolver(tsPath, options);
    } catch {
      // Fall back to original path if .ts doesn't exist
    }
  }
  
  // Use default resolution
  return defaultResolver(path, options);
};