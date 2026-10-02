// Reports where the plugin hook (scripts/stage-sdk.js in cordova-plugin-imatch) will take the iMatch SDK binaries from.
const fs = require('fs');
const path = require('path');

const PLUGIN_ID = 'cordova-plugin-imatch';
const VARIABLE = 'IMATCH_SDK_DIR';

const project = path.resolve(__dirname, '..');

function variableFromPackage() {
    try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
        const saved = packageJson.cordova && packageJson.cordova.plugins && packageJson.cordova.plugins[PLUGIN_ID];
        return (saved && saved[VARIABLE]) || null;
    } catch (error) {
        return null;
    }
}

// Before the first install the plugin is copied from node_modules.
const installedPlugin = path.join(project, 'plugins', PLUGIN_ID);
const pluginDir = fs.existsSync(installedPlugin) ? installedPlugin : path.join(project, 'node_modules', PLUGIN_ID);

// Keep this order the same as candidateDirs in the hook.
const candidates = [...new Set([
    variableFromPackage(),
    process.env[VARIABLE],
    'imatch-sdk',
    path.join(pluginDir, 'sdk')
].filter(Boolean).map(directory => path.resolve(project, directory)))];

const binaries = {
    android: path.join('android', 'imatchsdk.aar'),
    ios: path.join('ios', 'iMatchSDK.xcframework')
};

let foundPlatforms = 0;
for (const [platform, relative] of Object.entries(binaries)) {
    const found = candidates.find(directory => fs.existsSync(path.join(directory, relative)));
    if (found) {
        foundPlatforms++;
        console.log(`${platform}: ${path.join(found, relative)}`);
    } else {
        console.log(`${platform}: not found (looked in ${candidates.join(', ')})`);
    }
}

if (foundPlatforms < Object.keys(binaries).length) {
    console.log('\nRequest the iMatch SDK drop from BPI and unzip it into ' + path.join(project, 'imatch-sdk'));
    console.log('Only the platforms you build for need to be present.');
}

// Only the platforms you build for are needed, so fail only when nothing was found.
if (foundPlatforms === 0) {
    process.exitCode = 1;
}
