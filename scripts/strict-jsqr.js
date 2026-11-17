import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
export const jsqrEntry = require.resolve('jsqr');
const jsqrDirectory = dirname(dirname(jsqrEntry));
const packageJson = JSON.parse(readFileSync(resolve(jsqrDirectory, 'package.json'), 'utf8'));
const EXPECTED_VERSION = '1.4.0';
const EXPECTED_SHA256 = 'bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859';
export const JSQR_MODIFICATION_NOTICE =
  '/*! jsQR 1.4.0 is locally modified to reject unsupported QR modes and malformed ECI prefixes. See third-party-notices.txt. */';

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first === -1 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Strict jsQR patch: expected exactly one ${label} source match`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

export function patchJsqrSource(source) {
  if (packageJson.version !== EXPECTED_VERSION) {
    throw new Error(`Strict jsQR patch: expected jsqr ${EXPECTED_VERSION}, found ${packageJson.version}`);
  }
  const digest = createHash('sha256').update(source).digest('hex');
  if (digest !== EXPECTED_SHA256) {
    throw new Error(`Strict jsQR patch: unexpected jsQR ${EXPECTED_VERSION} source SHA-256 ${digest}`);
  }

  // Local security modification: malformed ECI prefixes must not be accepted.
  source = replaceExactlyOnce(
    source,
    `            else {
                // ECI data seems corrupted
                result.chunks.push({
                    type: Mode.ECI,
                    assignmentNumber: -1,
                });
            }`,
    `            else {
                // Local security modification: reject malformed ECI prefixes.
                throw new Error("Invalid ECI assignment number");
            }`,
    'malformed ECI branch',
  );

  // Local security modification: unsupported modes cannot be skipped, since that
  // would let the caller receive a silently truncated payload.
  source = replaceExactlyOnce(
    source,
    `        else if (mode === ModeByte.Kanji) {
            var kanjiResult = decodeKanji(stream, size);
            result.text += kanjiResult.text;
            (_d = result.bytes).push.apply(_d, kanjiResult.bytes);
            result.chunks.push({
                type: Mode.Kanji,
                bytes: kanjiResult.bytes,
                text: kanjiResult.text,
            });
        }
    }`,
    `        else if (mode === ModeByte.Kanji) {
            var kanjiResult = decodeKanji(stream, size);
            result.text += kanjiResult.text;
            (_d = result.bytes).push.apply(_d, kanjiResult.bytes);
            result.chunks.push({
                type: Mode.Kanji,
                bytes: kanjiResult.bytes,
                text: kanjiResult.text,
            });
        }
        else {
            // Local security modification: reject unsupported QR modes.
            throw new Error("Unsupported QR mode: " + mode);
        }
    }`,
    'mode-dispatch tail',
  );
  return source;
}
