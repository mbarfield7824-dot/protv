const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withAndroidRelease(config) {
  return withAppBuildGradle(config, (result) => {
    let source = result.modResults.contents;
    if (source.includes('// PROtv upload signing')) return result;
    if (!source.includes('signingConfigs {') || !/release\s*\{[\s\S]*?signingConfig signingConfigs.debug/.test(source)) {
      throw new Error('Android signing template changed; refusing to leave release signed with the debug key.');
    }
    source = source.replace(/(release\s*\{[\s\S]*?)signingConfig signingConfigs.debug/, '$1signingConfig signingConfigs.release');
    source = source.replace('signingConfigs {', `signingConfigs {
        // PROtv upload signing
        release {
            def keyPath = System.getenv('PROTV_UPLOAD_KEYSTORE')
            if (keyPath) {
                storeFile file(keyPath)
                storePassword System.getenv('PROTV_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('PROTV_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('PROTV_UPLOAD_KEY_PASSWORD')
            }
        }`);
    source += `
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') }) {
        ['PROTV_UPLOAD_KEYSTORE', 'PROTV_UPLOAD_STORE_PASSWORD', 'PROTV_UPLOAD_KEY_ALIAS', 'PROTV_UPLOAD_KEY_PASSWORD'].each { name ->
            if (!System.getenv(name)) throw new GradleException("Missing release signing environment variable: " + name)
        }
    }
}
`;
    result.modResults.contents = source;
    return result;
  });
};
