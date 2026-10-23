'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const mobileRequire = createRequire(require('node:path').resolve(__dirname, '../../mobile/package.json'));
const { verifyOrPatch } = require('../../mobile/scripts/patchForgeVerification.cjs');

test('installed tooling rejects extra nested DigestAlgorithm data while accepting valid signatures', () => {
  verifyOrPatch(true);
  const forge = mobileRequire('node-forge');
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 3 });
  const digest = () => forge.md.sha256.create().update('HUGPONG verification regression');
  assert.equal(publicKey.verify(digest().digest().getBytes(), privateKey.sign(digest())), true);
  const a = forge.asn1;
  const node = (type, constructed, value) => a.create(a.Class.UNIVERSAL, type, constructed, value);
  const oid = node(a.Type.OID, false, a.oidToDer(forge.oids.sha256).getBytes());
  const nil = node(a.Type.NULL, false, '');
  for (const parameters of [[oid], [oid, nil]]) {
    const info = node(a.Type.SEQUENCE, true, [node(a.Type.SEQUENCE, true, parameters), node(a.Type.OCTETSTRING, false, digest().digest().getBytes())]);
    const valid = privateKey.sign(a.toDer(info).getBytes(), 'NONE');
    assert.equal(publicKey.verify(digest().digest().getBytes(), valid), true);
  }
  for (const parameters of [[oid, nil, node(a.Type.OCTETSTRING, false, 'ignored garbage')], [oid, node(a.Type.NULL, false, 'garbage')]]) {
    const info = node(a.Type.SEQUENCE, true, [node(a.Type.SEQUENCE, true, parameters), node(a.Type.OCTETSTRING, false, digest().digest().getBytes())]);
    const malformed = privateKey.sign(a.toDer(info).getBytes(), 'NONE');
    assert.throws(() => publicKey.verify(digest().digest().getBytes(), malformed), /valid RSASSA/);
  }
});
