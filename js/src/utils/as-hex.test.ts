import { describe, it, expect } from 'vitest';
import { asHex } from './as-hex';

describe('asHex', () => {
  it('should convert string without 0x prefix to hex', () => {
    expect(asHex('abc123')).toBe('0xabc123');
    expect(asHex('1234567890abcdef')).toBe('0x1234567890abcdef');
  });

  it('should pass through valid hex string with 0x prefix', () => {
    expect(asHex('0xabc123')).toBe('0xabc123');
    expect(asHex('0x1234567890abcdef')).toBe('0x1234567890abcdef');
  });

  it('should handle uppercase hex characters', () => {
    expect(asHex('ABC123')).toBe('0xABC123');
    expect(asHex('0xABC123')).toBe('0xABC123');
  });

  it('should handle mixed case hex characters', () => {
    expect(asHex('aBc123')).toBe('0xaBc123');
    expect(asHex('0xaBc123')).toBe('0xaBc123');
  });

  it('should handle empty string as valid hex', () => {
    expect(asHex('')).toBe('0x');
    expect(asHex('0x')).toBe('0x');
  });

  it('should throw error for invalid hex characters', () => {
    expect(() => asHex('xyz')).toThrow('Invalid hex value: xyz');
    expect(() => asHex('0xghi')).toThrow('Invalid hex value: 0xghi');
    expect(() => asHex('123z')).toThrow('Invalid hex value: 123z');
  });

  it('should throw error for non-string values', () => {
    expect(() => asHex(123)).toThrow('Invalid hex value: 123');
    expect(() => asHex(null)).toThrow('Invalid hex value: null');
    expect(() => asHex(undefined)).toThrow('Invalid hex value: undefined');
    expect(() => asHex({})).toThrow('Invalid hex value: [object Object]');
  });

  it('should handle device ID format', () => {
    const deviceId = '1234567890abcdef1234567890abcdef';
    expect(asHex(deviceId)).toBe('0x1234567890abcdef1234567890abcdef');
  });

  it('should handle compose hash format', () => {
    const composeHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    expect(asHex(composeHash)).toBe('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
  });
}); 