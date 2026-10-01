// Reports where the iMatch SDK binaries will be staged from, using the same lookup order as the plugin hook.
const fs = require('fs');
const path = require('path');

const project = path.resolve(__dirname, '..');
const plugin = path.resolve(project, '..', 'cordova-plugin-imatch');
const candidates = [
    process.env.IMATCH_SDK_DIR,
    path.join(project, 'imatch-sdk'),
    path.join(plugin, 'sdk')
].filter(Boolean);

const binaries = {
    android: path.join('android', 'imatchsdk.aar'),
    ios: path.join('ios', 'iMatchSDK.xcframework')
};

let failed = false;
for (const [platform, relative] of Object.entries(binaries)) {
    const found = candidates.find(dir => fs.existsSync(path.join(dir, relative)));
    if (found) {
        console.log(`${platform}: ${path.join(found, relative)}`);
    } else {
        failed = true;
        console.log(`${platform}: not found (looked in ${candidates.join(', ')})`);
    }
}

if (failed) {
    console.log('\nRequest the iMatch SDK drop from BPI and unzip it into ' + path.join(project, 'imatch-sdk'));
    console.log('Only the platforms you build for need to be present.');
}
