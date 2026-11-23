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
    get decryptSecret () {
        return decryptSecret;
    },
    get encryptSecret () {
        return encryptSecret;
    }
});
const _nodecrypto = require("node:crypto");
const ALGO = 'aes-256-gcm';
function key() {
    const raw = process.env.APP_ENCRYPTION_KEY;
    if (!raw) throw new Error('APP_ENCRYPTION_KEY is not set');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes (base64)');
    return buf;
}
function encryptSecret(plain) {
    const iv = Buffer.from(crypto.getRandomValues(new Uint8Array(12)));
    const cipher = (0, _nodecrypto.createCipheriv)(ALGO, key(), iv);
    const enc = Buffer.concat([
        cipher.update(plain, 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return [
        'v1',
        iv.toString('base64url'),
        tag.toString('base64url'),
        enc.toString('base64url')
    ].join('.');
}
function decryptSecret(payload) {
    const [version, iv, tag, data] = payload.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted payload');
    const decipher = (0, _nodecrypto.createDecipheriv)(ALGO, key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final()
    ]).toString('utf8');
}
