import { type Hex, isHex } from "viem";

/**
 * Converts a value to a hex string with 0x prefix.
 *
 * @param value - The value to convert to hex. Can be a string with or without 0x prefix.
 * @returns A valid hex string with 0x prefix.
 * @throws Error if the value cannot be converted to a valid hex string.
 *
 * @example
 * ```typescript
 * asHex("abc123") // "0xabc123"
 * asHex("0xabc123") // "0xabc123"
 * asHex("xyz") // throws Error
 * ```
 */
export function asHex(value: unknown): Hex {
  if (typeof value === "string") {
    if (value.startsWith("0x") && isHex(value)) {
      return value as Hex;
    } else if (isHex(`0x${value}`)) {
      return `0x${value}` as Hex;
    }
  }
  throw new Error(`Invalid hex value: ${value}`);
}
