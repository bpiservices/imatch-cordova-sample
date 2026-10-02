var mrz = (function () {
    var FORMATS = [
        { name: 'TD3', lines: 2, length: 44 },
        { name: 'TD2', lines: 2, length: 36 },
        { name: 'TD1', lines: 3, length: 30 }
    ];

    var WEIGHTS = [7, 3, 1];

    function charValue(c) {
        if (c === '<') { return 0; }
        if (c >= '0' && c <= '9') { return c.charCodeAt(0) - 48; }
        if (c >= 'A' && c <= 'Z') { return c.charCodeAt(0) - 55; }
        return 0;
    }

    function checkDigit(str) {
        var total = 0;
        for (var i = 0; i < str.length; i++) {
            total += charValue(str[i]) * WEIGHTS[i % 3];
        }
        return String(total % 10);
    }

    function strip(str) {
        return str.replace(/</g, ' ').trim();
    }

    function normalize(text) {
        var lines = String(text || '')
            .toUpperCase()
            .split(/\r?\n/)
            .map(function (line) { return line.replace(/\s+/g, ''); })
            .filter(function (line) { return line.length > 0; });

        var format = FORMATS.find(function (f) {
            return f.lines === lines.length && lines.every(function (l) { return l.length === f.length; });
        });

        return { lines: lines, format: format ? format.name : null };
    }

    function parseTD3(lines) {
        var l1 = lines[0];
        var l2 = lines[1];
        var docNumber = l2.substring(0, 9);
        var dob = l2.substring(13, 19);
        var expiry = l2.substring(21, 27);
        var personal = l2.substring(28, 42);
        var composite = l2.substring(0, 10) + l2.substring(13, 20) + l2.substring(21, 43);
        var names = l1.substring(5).split('<<');

        return {
            documentCode: strip(l1.substring(0, 2)),
            issuingState: strip(l1.substring(2, 5)),
            surname: strip(names[0]),
            givenNames: strip(names[1] || ''),
            documentNumber: strip(docNumber),
            nationality: strip(l2.substring(10, 13)),
            dateOfBirth: dob,
            sex: l2.substring(20, 21),
            dateOfExpiry: expiry,
            checkDigits: {
                documentNumber: checkDigit(docNumber) === l2[9],
                dateOfBirth: checkDigit(dob) === l2[19],
                dateOfExpiry: checkDigit(expiry) === l2[27],
                personalNumber: checkDigit(personal) === l2[42] || (strip(personal) === '' && l2[42] === '<'),
                composite: checkDigit(composite) === l2[43]
            }
        };
    }

    return {
        normalize: normalize,
        parseTD3: parseTD3,
        checkDigit: checkDigit
    };
}());
