// Windows release builds only: native modules whose generated C++ paths exceed the 260-character Windows limit are
// built from short mirrors of the same installed packages. scripts/build-android-release.ps1 -ShortNativeLinks
// refreshes the mirrors and sets PROTV_SHORT_NATIVE_LINKS; without it nothing changes (macOS, EAS, iOS).
const fs = require('fs');
const path = require('path');

const SHORT_NAMES = {
  'react-native-gesture-handler': 'g',
  'react-native-reanimated': 'r',
  'react-native-safe-area-context': 's',
  'react-native-screens': 't',
  'react-native-worklets': 'w',
};

const linksDir = process.env.PROTV_SHORT_NATIVE_LINKS;
const dependencies = {};
if (linksDir) {
  for (const [name, short] of Object.entries(SHORT_NAMES)) {
    const root = path.join(linksDir, short);
    if (fs.existsSync(path.join(root, 'package.json'))) dependencies[name] = { root };
  }
}

module.exports = { dependencies };
