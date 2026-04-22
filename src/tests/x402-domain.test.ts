import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { TYI_USD_PAYMENT_COIN, BASE_SEPOLIA_CHAIN_ID } from "../constants.js";

// Onchain DOMAIN_SEPARATOR for TYI_MOCK_USD at 0x27DC1C167AeF232bb1e21073304B526726a8727e on Base Sepolia
const KNOWN_ONCHAIN_DS =
  "0x932af94b838474ac490d2d04354ee260208545b7e70be2f7937897daae22d66d";
const TYI_ADDRESS = "0x27DC1C167AeF232bb1e21073304B526726a8727e";

describe("x402 domain separator", () => {
  it("TYI_MOCK_USD constant matches onchain DOMAIN_SEPARATOR", () => {
    const domain = {
      name: TYI_USD_PAYMENT_COIN,
      version: "1",
      chainId: Number(BASE_SEPOLIA_CHAIN_ID),
      verifyingContract: TYI_ADDRESS,
    };
    const local = ethers.TypedDataEncoder.hashDomain(domain);
    expect(local.toLowerCase()).toBe(KNOWN_ONCHAIN_DS.toLowerCase());
  });

  it("wrong name breaks domain separator", () => {
    const domain = {
      name: "TYI Mock USD",
      version: "1",
      chainId: Number(BASE_SEPOLIA_CHAIN_ID),
      verifyingContract: TYI_ADDRESS,
    };
    const local = ethers.TypedDataEncoder.hashDomain(domain);
    expect(local.toLowerCase()).not.toBe(KNOWN_ONCHAIN_DS.toLowerCase());
  });
});
