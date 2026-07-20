import { TokenStore } from "./token-store.js";
import { KeychainSecretBackend } from "./keychain.js";

/**
 * Factory that wires a TokenStore with the OS keychain backend.
 * Falls back to in-memory storage with a warning when the native CLI
 * is unavailable (CI, containers, or unsupported OS).
 */
export function createTokenStore(
  serviceName = "production-master",
): TokenStore {
  const backend = new KeychainSecretBackend(serviceName);
  return new TokenStore({ backend, issuer: serviceName });
}
