import {
  canonicalizePhoneDigits,
  canonicalizePhoneE164,
  phoneLookupVariants,
} from './phone.utils';

describe('phone utils', () => {
  it.each([
    ['5216564351052', '+526564351052'],
    ['+5216564351052', '+526564351052'],
    ['52 656 435 1052', '+526564351052'],
    ['+52(656)435-1052', '+526564351052'],
  ])('canonicalizes Mexican WhatsApp variant %s to %s', (input, expected) => {
    expect(canonicalizePhoneE164(input)).toBe(expected);
    expect(canonicalizePhoneDigits(input)).toBe(expected.replace('+', ''));
  });

  it('keeps non-Mexican country codes intact', () => {
    expect(canonicalizePhoneE164('+15755716627')).toBe('+15755716627');
  });

  it('returns both +52 and +521 lookup variants for Mexican numbers', () => {
    expect(phoneLookupVariants('+526564351052')).toEqual(
      expect.arrayContaining([
        '+526564351052',
        '526564351052',
        '+5216564351052',
        '5216564351052',
      ]),
    );
  });
});
