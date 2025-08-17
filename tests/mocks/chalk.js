const chalk = {
  red: (text) => text,
  green: (text) => text,
  yellow: (text) => text,
  blue: (text) => text,
  cyan: (text) => text,
  gray: (text) => text,
  white: (text) => text,
  bold: (text) => text,
  dim: (text) => text,
  bgRed: (text) => text,
  bgGreen: (text) => text,
  bgYellow: (text) => text,
  bgBlue: (text) => text
};

// Add chaining support
Object.keys(chalk).forEach(key => {
  if (typeof chalk[key] === 'function') {
    Object.keys(chalk).forEach(chainKey => {
      if (typeof chalk[chainKey] === 'function') {
        chalk[key][chainKey] = chalk[chainKey];
      }
    });
  }
});

export default chalk;