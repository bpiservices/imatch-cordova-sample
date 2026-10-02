var iMatchEvents = (function () {
    var FINGER_QUALITY = { 1: 'good', 2: 'fair', 3: 'poor' };

    var ACQUISITION_STATUS = {
        0: 'capture completed',
        303: 'partial segmentation, fewer fingers than requested'
    };

    var DISCONNECT_REASONS = {
        normal: 'Disconnected',
        timeout: 'Connection timed out',
        staleBond: 'The iMatch no longer accepts the stored pairing. Forget the iMatch in the phone\'s Bluetooth settings, then connect again.',
        unknown: 'Connection lost'
    };

    var IMAGE_SIGNATURES = [
        { bytes: [0xFF, 0xD8, 0xFF], mimeType: 'image/jpeg', container: 'jpeg' },
        { bytes: [0x89, 0x50, 0x4E, 0x47], mimeType: 'image/png', container: 'png' },
        { bytes: [0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20], mimeType: 'image/jp2', container: 'jp2' },
        { bytes: [0xFF, 0x4F, 0xFF, 0x51], mimeType: 'image/jp2', container: 'j2k' }
    ];

    function errorText(error) {
        if (error == null) { return 'unknown error'; }
        if (typeof error === 'string') { return error; }
        var data = error.data !== undefined ? error.data : error;
        if (typeof data === 'string') { return data; }
        if (data && data.message) { return data.code ? data.code + ' ' + data.message : data.message; }
        if (data && data.error) { return data.error; }
        return JSON.stringify(data);
    }

    function battery(status) {
        if (!status || status.cv === undefined) { return ''; }
        return Math.round(status.cv) + '% ' + String(status.state || '').toUpperCase();
    }

    function fingerQuality(values, fingers) {
        if (!Array.isArray(values)) { return String(values); }
        var picks = fingers === 1 ? [0] : fingers === 2 ? [0, 3] : [0, 1, 2, 3];
        return picks.map(function (index, i) {
            return 'FP' + (i + 1) + ': ' + (FINGER_QUALITY[values[index]] || 'none');
        }).join('  ');
    }

    function acquisitionStatus(code) {
        var status = parseInt(code, 10);
        return ACQUISITION_STATUS[status] || ('status ' + code);
    }

    function disconnect(event) {
        var data = event && event.data;
        var reason = data && typeof data === 'object' ? data.reason : undefined;
        return {
            reason: reason || 'normal',
            staleBond: reason === 'staleBond',
            text: DISCONNECT_REASONS[reason] || DISCONNECT_REASONS.normal
        };
    }

    function sniffImage(base64) {
        var head;
        try {
            head = atob(String(base64).substring(0, 16));
        } catch (e) {
            return { mimeType: null, container: 'unknown' };
        }
        var match = IMAGE_SIGNATURES.find(function (sig) {
            return sig.bytes.every(function (b, i) { return head.charCodeAt(i) === b; });
        });
        return match || { mimeType: null, container: 'unknown' };
    }

    function decodeDg2(data, done) {
        var image = data && data.image;
        if (!image) {
            done(null, 'no image in the payload');
            return;
        }
        if (data.decodeError) {
            done(null, data.decodeError + (data.sourceMimeType ? ' (' + data.sourceMimeType + ')' : ''));
            return;
        }
        var kind = sniffImage(image);
        if (kind.container === 'jp2' || kind.container === 'j2k') {
            done(null, 'JPEG 2000 image was not decoded by the plugin', kind);
            return;
        }
        done('data:' + (kind.mimeType || data.mimeType || 'image/jpeg') + ';base64,' + image, null, kind);
    }

    return {
        errorText: errorText,
        battery: battery,
        fingerQuality: fingerQuality,
        acquisitionStatus: acquisitionStatus,
        disconnect: disconnect,
        sniffImage: sniffImage,
        decodeDg2: decodeDg2
    };
}());
