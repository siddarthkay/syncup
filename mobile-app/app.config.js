const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  let version = config.version;
  try {
    version = fs
      .readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8')
      .trim();
  } catch {
    // keep app.json's version as a fallback
  }
  return { ...config, version };
};
