import { expect, test } from 'bun:test';
import { sealTransfer, openTransfer } from '../src/core/tv/pairingCrypto';
test('only the originating TV can decrypt a selected credential transfer', async () => {
  const generate = () => crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
  const tv = await generate(), otherTV = await generate();
  const publicKey = await crypto.subtle.exportKey('jwk', tv.publicKey);
  const payload = { version: 1 as const, credentials: { torbox: 'test-selected-key' } };
  const sealed = await sealTransfer(publicKey, payload);
  expect(JSON.stringify(sealed)).not.toContain('test-selected-key');
  expect(await openTransfer(tv.privateKey, sealed)).toEqual(payload);
  await expect(openTransfer(otherTV.privateKey, sealed)).rejects.toThrow();
  await expect(openTransfer(tv.privateKey, { ...sealed, ciphertext: sealed.ciphertext.slice(0, -4) + 'AAAA' })).rejects.toThrow();
});
test('rejects unapproved arbitrary storage keys', async () => {
  const tv = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, false, ['encrypt', 'decrypt']);
  await expect(sealTransfer(await crypto.subtle.exportKey('jwk', tv.publicKey), { version: 1, credentials: { arbitrary: 'no' } })).rejects.toThrow();
});
