var app = {
    FP_CAPTURE_TIMEOUT_MS: 60000,
    NFC_QUIET_MS: 1500,
    MRZ_STORAGE_KEY: 'imatch-sample.mrz',

    state: {
        deviceName: null,
        connected: false,
        hardware: null,
        updateRequired: false,
        updateVersion: null,
        updating: false,
        captureTimer: null,
        nfcTimer: null,
        nfcSeen: {},
        nfcCheckedGroups: 0,
        nfcCheckFailed: false
    },

    initialize: function () {
        document.addEventListener('deviceready', app.onDeviceReady, false);
        app.$('connectButton').addEventListener('click', app.connectPressed);
        app.$('disconnectButton').addEventListener('click', app.disconnectPressed);
        app.$('fingerButton').addEventListener('click', app.fingerprintPressed);
        app.$('smartcardButton').addEventListener('click', app.smartcardPressed);
        app.$('nfcButton').addEventListener('click', app.passportPressed);
        app.$('updateButton').addEventListener('click', app.updatePressed);
        app.$('cancelUpdateButton').addEventListener('click', app.cancelUpdatePressed);
        app.$('clearButton').addEventListener('click', app.clearLog);
        app.$('mrzInput').addEventListener('input', app.mrzChanged);
        app.restoreMrz();
    },

    onDeviceReady: function () {
        if (!window.iMatch) {
            app.log('cordova-plugin-imatch is not installed', 'error');
            return;
        }
        app.$('connectButton').disabled = false;

        iMatch.setReceiveEventListener(app.onDeviceEvent, function (error) {
            app.log('Event listener error: ' + iMatchEvents.errorText(error), 'error');
        });
        iMatch.setDisconnectHandler(app.onDisconnected);
        iMatch.initialize(
            function () { app.log('iMatch plugin initialised. Tap Connect.'); },
            function (error) { app.log('Initialisation failed: ' + iMatchEvents.errorText(error), 'error'); }
        );
    },

    // ------------------------------------------------------------------ connection

    connectPressed: function () {
        app.log('Searching for iMatch devices');
        app.$('connectButton').disabled = true;

        iMatch.list(
            function (response) {
                var devices = response.data || [];
                app.$('connectButton').disabled = false;

                if (devices.length === 0) {
                    app.log('No iMatch found. Make sure it is switched on and paired.', 'warn');
                } else if (devices.length === 1) {
                    app.connect(devices[0]);
                } else {
                    app.showDevices(devices);
                }
            },
            function (error) {
                app.$('connectButton').disabled = false;
                app.log('Scan failed: ' + iMatchEvents.errorText(error), 'error');
            }
        );
    },

    showDevices: function (devices) {
        var list = app.$('devices');
        list.innerHTML = '';
        devices.forEach(function (name) {
            var button = document.createElement('button');
            button.textContent = name;
            button.addEventListener('click', function () {
                list.hidden = true;
                app.connect(name);
            });
            list.appendChild(button);
        });
        list.hidden = false;
        app.log('Found ' + devices.length + ' devices, pick one');
    },

    connect: function (name) {
        app.state.deviceName = name;
        app.setStatus('Connecting to ' + name);
        app.log('Connecting to ' + name);

        iMatch.connect(name,
            function (response) {
                var data = response.data;
                if (response.method === 'connect' && data && data.connected === false) {
                    app.log('Connection failed: ' + (data.message || 'unknown reason'), 'error');
                    app.setConnected(false);
                    return;
                }
                if (response.method === 'disconnect' || (data && data.connected === false)) {
                    app.setConnected(false);
                    return;
                }
                if (data && data.connected === true && !app.state.connected) {
                    app.setConnected(true);
                    app.onConnected();
                }
            },
            function (error) {
                app.log('Could not connect to ' + name + ': ' + iMatchEvents.errorText(error), 'error');
                app.setConnected(false);
            }
        );
    },

    onConnected: function () {
        app.log('Connected to ' + app.state.deviceName, 'ok');

        iMatch.hardwareVersion(
            function (response) {
                app.state.hardware = response.data;
                app.$('hardware').textContent = response.data;
            },
            function (error) { app.log('Hardware version unknown: ' + iMatchEvents.errorText(error), 'warn'); }
        );

        iMatch.needsUpdate(
            function (response) {
                var data = response.data || {};
                app.state.updateRequired = !!data.required;
                app.state.updateVersion = data.version || null;
                if (data.required) {
                    app.log('Firmware update available' + (data.version ? ' (' + data.version + ')' : '') + '. Tap Update.', 'warn');
                }
            },
            function (error) { app.log('Update check failed: ' + iMatchEvents.errorText(error), 'warn'); }
        );
    },

    disconnectPressed: function () {
        iMatch.connected(
            function () {
                app.log('Disconnecting');
                iMatch.disconnect();
            },
            function () {
                app.log('Already disconnected');
                app.setConnected(false);
            }
        );
    },

    onDisconnected: function (event) {
        var info = iMatchEvents.disconnect(event);
        app.finishCapture();
        app.setConnected(false);
        app.log(info.text, info.staleBond ? 'warn' : undefined);
        if (info.staleBond) {
            alert(info.text);
        }
    },

    setConnected: function (connected) {
        app.state.connected = connected;
        if (!connected) {
            app.state.hardware = null;
            app.state.updateRequired = false;
            app.$('hardware').textContent = '';
            app.$('firmware').textContent = '';
            app.$('battery').textContent = '';
        }
        app.$('deviceInfo').hidden = !connected;
        app.setStatus(connected ? 'Connected to ' + app.state.deviceName : 'Not connected');
        app.enableActions(connected);
    },

    // ------------------------------------------------------------------ device events

    onDeviceEvent: function (event) {
        var data = event.data;
        switch (event.method) {
            case 'status':
                app.$('battery').textContent = iMatchEvents.battery(data);
                break;
            case 'info':
                if (data && data.version) {
                    app.$('firmware').textContent = 'firmware ' + data.version;
                }
                break;
            case 'error':
                app.log('Device error: ' + iMatchEvents.errorText(event), 'error');
                break;
            default:
                break;
        }
    },

    // ------------------------------------------------------------------ fingerprint

    fingerprintPressed: function () {
        if (!app.requireConnection()) { return; }

        if (app.state.updateRequired) {
            var version = app.state.updateVersion ? ' to ' + app.state.updateVersion : '';
            if (confirm('The iMatch firmware should be updated' + version + ' before using the fingerprint reader. Update now?')) {
                app.updatePressed();
                return;
            }
        }

        var start = function (hardware) {
            if (hardware === 'iMatch45' || hardware === 'iMatch50' || hardware === 'iMatch60') {
                app.captureIMatch45();
            } else if (hardware === 'iMatch20') {
                app.captureFAP20();
            } else {
                app.log('Hardware type unknown, cannot choose a capture mode', 'error');
            }
        };

        if (app.state.hardware && app.state.hardware !== 'Unknown') {
            start(app.state.hardware);
            return;
        }
        iMatch.hardwareVersion(
            function (response) {
                app.state.hardware = response.data;
                app.$('hardware').textContent = response.data;
                start(response.data);
            },
            function (error) { app.log('Hardware version unknown: ' + iMatchEvents.errorText(error), 'error'); }
        );
    },

    captureIMatch45: function () {
        app.log('Fingerprint capture: place two fingers on the sensor');
        app.startCaptureTimer();

        iMatch.scanFingerprint('FLAT_TWO_FINGERS', false, true,
            function (event) {
                var data = event.data;
                switch (event.method) {
                    case 'fp_count':
                        app.log('Fingers detected: ' + data);
                        break;
                    case 'fp_image_type':
                        app.log('Image format: ' + String(data).toUpperCase());
                        break;
                    case 'fp_quality':
                        app.log('Quality ' + iMatchEvents.fingerQuality(data, 2));
                        break;
                    case 'fp_receiving':
                        app.log('Receiving image');
                        break;
                    case 'fp_image_progress':
                        app.showProgress('Receiving image', parseInt(data, 10));
                        break;
                    case 'fp_image':
                        app.hideProgress();
                        app.showFingerprint(data);
                        break;
                    case 'fp_nfiq':
                        app.log('NFIQ ' + JSON.stringify(data));
                        break;
                    case 'fp_acquisition_completed':
                        app.log('Acquisition: ' + iMatchEvents.acquisitionStatus(data));
                        app.startCaptureTimer();
                        break;
                    case 'fp_finished':
                        app.log('Capture finished', 'ok');
                        app.finishCapture();
                        iMatch.powerOffFingerprint(true);
                        break;
                    case 'error':
                        app.captureFailed(event);
                        break;
                    default:
                        app.log(event.method + (data !== undefined && typeof data !== 'object' ? ': ' + data : ''));
                        break;
                }
            },
            app.captureFailed,
            ['WSQ', 'PNG']
        );
    },

    captureFAP20: function () {
        app.log('Fingerprint capture: place one finger on the sensor');
        app.startCaptureTimer();

        iMatch.scanFingerprintFAP20(
            function (event) {
                var data = event.data;
                switch (event.method) {
                    case 'message':
                        app.log(String(data));
                        break;
                    case 'fp_image':
                        app.showFingerprint(data);
                        app.log('Capture finished', 'ok');
                        app.finishCapture();
                        iMatch.powerOffFingerprint();
                        break;
                    case 'fp_enroll_result':
                        app.log('Capture ended without image, status ' + (data && data.status), 'warn');
                        app.finishCapture();
                        iMatch.powerOffFingerprint();
                        break;
                    case 'error':
                        app.captureFailed(event);
                        break;
                    default:
                        break;
                }
            },
            app.captureFailed
        );
    },

    showFingerprint: function (data) {
        var image = data && typeof data === 'object' ? data.image : data;
        if (!image) {
            app.log('Image event without data', 'warn');
            return;
        }
        var bytes = Math.floor(image.length * 3 / 4);
        var size = data.image_width ? ' ' + data.image_width + 'x' + data.image_height : '';
        var format = data.format ? String(data.format).toUpperCase() : 'WSQ';
        app.log(format + ' image received, ' + bytes + ' bytes' + size);
        var kind = iMatchEvents.sniffImage(image);
        if (kind.container === 'png' || kind.container === 'jpeg') {
            app.showImage('data:' + kind.mimeType + ';base64,' + image);
        } else if (format === 'BMP') {
            app.showImage('data:image/bmp;base64,' + image);
        }
    },

    startCaptureTimer: function () {
        clearTimeout(app.state.captureTimer);
        app.state.captureTimer = setTimeout(function () {
            app.state.captureTimer = null;
            app.log('No capture completion within ' + (app.FP_CAPTURE_TIMEOUT_MS / 1000) + ' s, switching the reader off', 'warn');
            iMatch.powerOffFingerprint();
        }, app.FP_CAPTURE_TIMEOUT_MS);
    },

    finishCapture: function () {
        clearTimeout(app.state.captureTimer);
        app.state.captureTimer = null;
        app.hideProgress();
    },

    captureFailed: function (error) {
        app.log('Fingerprint error: ' + iMatchEvents.errorText(error), 'error');
        app.finishCapture();
        if (app.state.connected) {
            iMatch.powerOffFingerprint();
        }
    },

    // ------------------------------------------------------------------ smartcard

    smartcardPressed: function () {
        if (!app.requireConnection()) { return; }
        app.log('Reading smartcard, insert the card');

        iMatch.readSmartcard(
            function (event) {
                var data = event.data;
                if (event.method === 'read_photo') {
                    app.log('Photo' + (data && data.sourceMimeType ? ' (' + data.sourceMimeType + ')' : ''));
                    iMatchEvents.decodeDg2(typeof data === 'object' ? data : { image: data }, app.onPhotoDecoded);
                } else if (event.method === 'read_certificate') {
                    app.log('Certificate: ' + Math.floor(String(data).length * 3 / 4) + ' bytes');
                } else if (data && typeof data === 'object') {
                    app.log(event.method);
                    app.logObject(data);
                } else {
                    app.log(event.method + ': ' + data);
                }
            },
            function (error) {
                app.log('Smartcard error: ' + iMatchEvents.errorText(error), 'error');
            }
        );
    },

    // ------------------------------------------------------------------ passport

    passportPressed: function () {
        if (!app.requireConnection()) { return; }

        var parsed = mrz.normalize(app.$('mrzInput').value);
        if (!parsed.format) {
            app.log('Enter the MRZ first: 2 lines of 44 (passport), 2 of 36 or 3 of 30 characters', 'error');
            app.$('mrzInput').focus();
            return;
        }

        app.saveMrz();
        app.state.nfcSeen = {};
        app.state.nfcCheckedGroups = 0;
        app.state.nfcCheckFailed = false;
        app.log('Reading document, hold it against the NFC antenna');

        iMatch.scanPassport(parsed.lines.join('\n'),
            function (event) {
                var data = event.data;
                var method = event.method;
                app.state.nfcSeen[method] = true;

                switch (method) {
                    case 'access_control':
                        if (data && data.success === false) {
                            var raw = typeof data.raw === 'object' ? JSON.stringify(data.raw) : String(data.raw);
                            app.log('Access control ' + (data.type || '') + ' failed: ' + raw, 'error');
                        } else {
                            app.log('Access control' + (data && data.type ? ' ' + data.type : '') + ' OK', 'ok');
                        }
                        break;
                    case 'read_efcom':
                        app.log('EF.COM' + (data && data.items ? ': ' + data.items.join(' ') : ''));
                        break;
                    case 'read_sod':
                        app.log('EF.SOD read');
                        break;
                    case 'read_dg1':
                        app.log('DG1');
                        if (data && data.mrz) {
                            app.mrzLines(String(data.mrz)).forEach(function (line) { app.log(line); });
                        } else {
                            app.logObject(data);
                        }
                        break;
                    case 'read_dg2':
                        app.log('DG2' + (data && data.sourceMimeType ? ' (' + data.sourceMimeType + ')' : ''));
                        iMatchEvents.decodeDg2(data, app.onPhotoDecoded);
                        break;
                    case 'read_dg5':
                    case 'read_dg7':
                        app.log(method.replace('read_', '').toUpperCase());
                        if (data && data.image) {
                            iMatchEvents.decodeDg2(data, app.onPhotoDecoded);
                        }
                        break;
                    case 'perform_aa':
                    case 'perform_ca':
                        app.log(method === 'perform_aa' ? 'Active authentication' : 'Chip authentication');
                        app.logObject(data);
                        break;
                    case 'read_bac':
                        // iOS reports a failed BAC as a plain read_bac event, "1" means it worked.
                        if (typeof data === 'string' && data !== '1') {
                            app.log('Access control BAC failed: ' + data + '. Check the MRZ.', 'error');
                        }
                        break;
                    case 'error':
                        app.log('Document error: ' + iMatchEvents.errorText(event), 'error');
                        break;
                    default:
                        if (/^read_dg\d+$/.test(method)) {
                            app.log(method.replace('read_', '').toUpperCase());
                            app.logObject(data);
                        } else {
                            app.log(method);
                            if (data && typeof data === 'object') {
                                app.logObject(data);
                            } else if (data !== undefined && data !== null && data !== '') {
                                app.logObject({ data: data });
                            }
                        }
                        break;
                }

                app.scheduleVerification();
            },
            function (error) {
                var data = error && error.data;
                if (error && error.method === 'access_control' && data) {
                    var raw = typeof data.raw === 'object' ? JSON.stringify(data.raw) : String(data.raw);
                    app.log('Access control ' + (data.type || '') + ' failed: ' + raw, 'error');
                } else {
                    app.log('Document error: ' + iMatchEvents.errorText(error), 'error');
                }
            }
        );
    },

    scheduleVerification: function () {
        clearTimeout(app.state.nfcTimer);
        app.state.nfcTimer = setTimeout(function () {
            var seen = app.state.nfcSeen;
            var groups = Object.keys(seen)
                .filter(function (method) { return /^read_dg\d+$/.test(method); })
                .map(function (method) { return parseInt(method.replace('read_dg', ''), 10); })
                .sort(function (first, second) { return first - second; });

            // The check only covers what was read so far, so run it again when more data groups came in.
            if (!seen.read_sod || !seen.read_dg1 || app.state.nfcCheckFailed || groups.length === app.state.nfcCheckedGroups) { return; }
            app.state.nfcCheckedGroups = groups.length;
            var label = 'Passive authentication (' + groups.map(function (number) { return 'DG' + number; }).join(', ') + '): ';

            iMatch.validateComputedHashes(
                function (response) {
                    var valid = response.data && response.data.validated;
                    app.log(label + (valid ? 'hashes valid' : 'hash mismatch'), valid ? 'ok' : 'error');
                },
                function (error) {
                    app.state.nfcCheckFailed = true;
                    app.log('Passive authentication: ' + iMatchEvents.errorText(error), 'warn');
                }
            );
        }, app.NFC_QUIET_MS);
    },

    onPhotoDecoded: function (dataUrl, error, kind) {
        if (error) {
            app.log(error + (kind && kind.container !== 'unknown' ? ' (' + kind.container + ')' : ''), 'warn');
            return;
        }
        app.showImage(dataUrl);
    },

    mrzLines: function (text) {
        if (text.indexOf('\n') >= 0) {
            return text.split(/\r?\n/).filter(Boolean);
        }
        var width = text.length % 30 === 0 ? 30 : text.length % 36 === 0 ? 36 : 44;
        return text.match(new RegExp('.{1,' + width + '}', 'g')) || [text];
    },

    mrzChanged: function () {
        var parsed = mrz.normalize(app.$('mrzInput').value);
        var hint = app.$('mrzHint');
        if (!parsed.lines.length) {
            hint.textContent = '';
        } else if (!parsed.format) {
            hint.textContent = parsed.lines.map(function (l) { return l.length; }).join(' + ') + ' characters, not a complete MRZ yet';
        } else if (parsed.format === 'TD3') {
            var doc = mrz.parseTD3(parsed.lines);
            var bad = Object.keys(doc.checkDigits).filter(function (k) { return !doc.checkDigits[k]; });
            hint.textContent = doc.documentNumber + ' ' + doc.issuingState + ' ' + doc.surname +
                (bad.length ? ', check digit mismatch: ' + bad.join(', ') : ', check digits OK');
        } else {
            hint.textContent = parsed.format + ' document';
        }
    },

    saveMrz: function () {
        try { localStorage.setItem(app.MRZ_STORAGE_KEY, app.$('mrzInput').value); } catch (e) { /* storage unavailable */ }
    },

    restoreMrz: function () {
        try {
            var saved = localStorage.getItem(app.MRZ_STORAGE_KEY);
            if (saved) {
                app.$('mrzInput').value = saved;
                app.mrzChanged();
            }
        } catch (e) { /* storage unavailable */ }
    },

    // ------------------------------------------------------------------ firmware update

    updatePressed: function () {
        if (!app.requireConnection() || app.state.updating) { return; }

        app.state.updating = true;
        app.enableActions(false);
        app.$('cancelUpdateButton').hidden = false;
        app.log('Starting firmware update, keep the iMatch switched on');

        iMatch.update(
            function (event) {
                var data = event.data || {};
                app.showProgress(data.action || 'Updating', data.progress || 0);
                if (data.completed) {
                    app.log('Firmware update completed', 'ok');
                    app.state.updateRequired = false;
                    app.endUpdate();
                }
            },
            function (error) {
                app.log('Firmware update failed: ' + iMatchEvents.errorText(error), 'error');
                app.endUpdate();
            }
        );
    },

    cancelUpdatePressed: function () {
        iMatch.cancelUpdate(function () {
            app.log('Firmware update cancelled', 'warn');
            app.endUpdate();
        });
    },

    endUpdate: function () {
        app.state.updating = false;
        app.$('cancelUpdateButton').hidden = true;
        app.hideProgress();
        app.enableActions(app.state.connected);
    },

    // ------------------------------------------------------------------ UI helpers

    $: function (id) {
        return document.getElementById(id);
    },

    requireConnection: function () {
        if (app.state.connected) { return true; }
        app.log('Connect to an iMatch first', 'warn');
        return false;
    },

    enableActions: function (connected) {
        var busy = app.state.updating;
        app.$('connectButton').disabled = connected || busy;
        ['disconnectButton', 'fingerButton', 'smartcardButton', 'nfcButton', 'updateButton'].forEach(function (id) {
            app.$(id).disabled = !connected || busy;
        });
    },

    setStatus: function (text) {
        app.$('deviceStatus').textContent = text;
    },

    showProgress: function (label, percent) {
        app.$('progress').hidden = false;
        app.$('progressLabel').textContent = label + ' ' + percent + '%';
        app.$('progressBar').style.width = Math.max(0, Math.min(100, percent)) + '%';
    },

    hideProgress: function () {
        app.$('progress').hidden = true;
        app.$('progressBar').style.width = '0';
    },

    log: function (text, level) {
        var line = document.createElement('span');
        line.className = 'line' + (level ? ' ' + level : '');
        line.textContent = text;
        app.appendToLog(line);
    },

    logObject: function (obj) {
        if (obj == null) { return; }
        if (typeof obj !== 'object') {
            app.log(String(obj));
            return;
        }
        Object.keys(obj).forEach(function (key) {
            var value = obj[key];
            if (value && typeof value === 'object') {
                value = JSON.stringify(value);
            }
            value = String(value);
            if (key === 'raw' || value.length > 120) {
                value = value.substring(0, 60) + '... (' + value.length + ' chars)';
            }
            var line = document.createElement('span');
            line.className = 'kv';
            var label = document.createElement('b');
            label.textContent = key + ' ';
            line.appendChild(label);
            line.appendChild(document.createTextNode(value));
            app.appendToLog(line);
        });
    },

    showImage: function (dataUrl) {
        var image = document.createElement('img');
        image.src = dataUrl;
        image.alt = '';
        app.appendToLog(image);
    },

    appendToLog: function (node) {
        var log = app.$('log');
        log.appendChild(node);
        window.scrollTo(0, document.body.scrollHeight);
    },

    clearLog: function () {
        app.$('log').innerHTML = '';
    }
};
