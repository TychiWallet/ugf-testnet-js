import { describe, it, expect, vi } from "vitest";
import { Quote } from "../quote.js";
import { UGFError } from "../types.js";
import { BASE_SEPOLIA_CHAIN_ID, TYI_USD_PAYMENT_COIN } from "../constants.js";

const validReq = {
  payer_address: "0xabc",
  tx_object: JSON.stringify({ from: "0xabc", to: "0xdef", value: "0" }),
};

function makeHttp(response: unknown) {
  return { post: vi.fn().mockResolvedValue(response) } as any;
}

describe("Quote", () => {
  it("returns quote when digest present", async () => {
    const http = makeHttp({ digest: "0xdeadbeef", payment_amount: "100" });
    const q = new Quote(http);
    const res = await q.get(validReq);
    expect(res.digest).toBe("0xdeadbeef");
  });

  it("throws UGFError when digest missing", async () => {
    const http = makeHttp({ payment_amount: "100" });
    const q = new Quote(http);
    await expect(q.get(validReq)).rejects.toMatchObject({
      code: "QUOTE_ERROR",
    });
  });

  it("rejects non-Base-Sepolia payment chain", async () => {
    const http = makeHttp({ digest: "0x1" });
    const q = new Quote(http);
    await expect(
      q.get({ ...validReq, payment_chain: "1" }),
    ).rejects.toBeInstanceOf(UGFError);
  });

  it("rejects non-TYI payment coin", async () => {
    const http = makeHttp({ digest: "0x1" });
    const q = new Quote(http);
    await expect(
      q.get({ ...validReq, payment_coin: "USDC" }),
    ).rejects.toBeInstanceOf(UGFError);
  });

  it("defaults to Base Sepolia and TYI when fields omitted", async () => {
    const http = makeHttp({ digest: "0x1" });
    const q = new Quote(http);
    await q.get(validReq);
    const body = http.post.mock.calls[0][1];
    expect(body.payment_chain).toBe(BASE_SEPOLIA_CHAIN_ID);
    expect(body.payment_coin).toBe(TYI_USD_PAYMENT_COIN);
    expect(body.dest_chain_id).toBe(BASE_SEPOLIA_CHAIN_ID);
  });
});
