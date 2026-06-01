import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateIPv4 } from '../components/CameraConfig';

/**
 * Property 6: IPv4 Validation
 *
 * For any string input, validateIPv4 correctly classifies it as a valid or
 * invalid IPv4 address. Only strings matching the IPv4 format (four octets
 * 0-255 separated by dots) SHALL be accepted.
 *
 * **Validates: Requirements 6.5**
 */
describe('validateIPv4 - Property 6: IPv4 Validation', () => {
  it('accepts any valid IPv4 address (four octets 0-255 joined by dots)', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 })
        ),
        ([a, b, c, d]) => {
          const ip = `${a}.${b}.${c}.${d}`;
          expect(validateIPv4(ip)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('rejects arbitrary strings that are not valid IPv4 addresses', () => {
    // Generate arbitrary strings and filter out the rare valid IPv4s
    const nonIPv4String = fc.string().filter((s) => {
      // Quick filter: reject strings that happen to be valid IPv4
      const parts = s.split('.');
      if (parts.length !== 4) return true;
      const allValid = parts.every((p) => {
        if (!/^\d+$/.test(p)) return false;
        const n = parseInt(p, 10);
        return n >= 0 && n <= 255 && String(n) === p;
      });
      return !allValid;
    });

    fc.assert(
      fc.property(nonIPv4String, (s) => {
        expect(validateIPv4(s)).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('rejects strings with octets greater than 255', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 256, max: 999 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 })
        ),
        fc.integer({ min: 0, max: 3 }),
        ([a, b, c, d], position) => {
          // Place the out-of-range octet at a random position
          const parts = [a, b, c, d];
          // Swap the first element (which is >255) into the chosen position
          [parts[0], parts[position]] = [parts[position], parts[0]];
          const ip = parts.join('.');
          expect(validateIPv4(ip)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects strings with non-numeric parts', () => {
    // Generate an IP-like string where at least one part is non-numeric
    const nonNumericPart = fc.string({ minLength: 1 }).filter((s) => !/^\d+$/.test(s));
    const numericOctet = fc.integer({ min: 0, max: 255 }).map(String);

    fc.assert(
      fc.property(
        fc.tuple(nonNumericPart, numericOctet, numericOctet, numericOctet),
        fc.integer({ min: 0, max: 3 }),
        ([nonNum, b, c, d], position) => {
          const parts = [nonNum, b, c, d];
          // Place the non-numeric part at the chosen position
          [parts[0], parts[position]] = [parts[position], parts[0]];
          const ip = parts.join('.');
          expect(validateIPv4(ip)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects strings with wrong number of dot-separated parts', () => {
    // Generate strings with fewer or more than 4 parts
    const wrongPartCount = fc.oneof(
      // 1-3 parts
      fc.integer({ min: 1, max: 3 }).chain((count) =>
        fc.tuple(...Array.from({ length: count }, () => fc.integer({ min: 0, max: 255 })))
          .map((parts) => parts.join('.'))
      ),
      // 5-8 parts
      fc.integer({ min: 5, max: 8 }).chain((count) =>
        fc.tuple(...Array.from({ length: count }, () => fc.integer({ min: 0, max: 255 })))
          .map((parts) => parts.join('.'))
      )
    );

    fc.assert(
      fc.property(wrongPartCount, (ip) => {
        expect(validateIPv4(ip)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects strings with leading zeros in octets', () => {
    // Generate IPs where at least one octet has a leading zero (e.g., "01", "001")
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 1, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 })
        ),
        fc.integer({ min: 0, max: 3 }),
        ([a, b, c, d], position) => {
          const parts = [String(a), String(b), String(c), String(d)];
          // Add a leading zero to the part at the chosen position
          parts[position] = '0' + parts[position];
          const ip = parts.join('.');
          expect(validateIPv4(ip)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
