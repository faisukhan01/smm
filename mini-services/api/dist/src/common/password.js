"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get hashPassword () {
        return hashPassword;
    },
    get verifyPassword () {
        return verifyPassword;
    }
});
const _nodecrypto = require("node:crypto");
const N = 16384;
const KEYLEN = 64;
function hashPassword(password) {
    const salt = (0, _nodecrypto.randomBytes)(16);
    const hash = (0, _nodecrypto.scryptSync)(password.normalize('NFKC'), salt, KEYLEN, {
        N
    });
    return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(password, stored) {
    try {
        const [algo, saltB64, hashB64] = stored.split('$');
        if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
        const salt = Buffer.from(saltB64, 'base64');
        const expected = Buffer.from(hashB64, 'base64');
        const actual = (0, _nodecrypto.scryptSync)(password.normalize('NFKC'), salt, expected.length, {
            N
        });
        return (0, _nodecrypto.timingSafeEqual)(actual, expected);
    } catch  {
        return false;
    }
}
