import { describe, expect, it } from "vitest";
import {
  issueStreamTicket,
  verifyStreamTicket,
} from "@cex/app-contracts/stream-ticket";

describe("stream tickets", () => {
  it("issues and verifies a ticket for a market", () => {
    const { ticket, expiresAt } = issueStreamTicket("secret", {
      market: "SOL-USD",
      userId: "user-1",
      now: 1_000_000,
      ttlMs: 60_000,
    });

    expect(expiresAt).toBe(1_060_000);
    expect(
      verifyStreamTicket("secret", ticket, "SOL-USD", 1_030_000),
    ).toEqual({
      market: "SOL-USD",
      exp: 1_060_000,
      userId: "user-1",
    });
  });

  it("rejects expired, wrong-market, and tampered tickets", () => {
    const { ticket } = issueStreamTicket("secret", {
      market: "SOL-USD",
      now: 1_000_000,
      ttlMs: 1_000,
    });

    expect(
      verifyStreamTicket("secret", ticket, "SOL-USD", 1_002_000),
    ).toBeNull();
    expect(
      verifyStreamTicket("secret", ticket, "SOL-USD-PERP", 1_000_500),
    ).toBeNull();
    expect(
      verifyStreamTicket("secret", `${ticket}x`, "SOL-USD", 1_000_500),
    ).toBeNull();
    expect(verifyStreamTicket("other", ticket, "SOL-USD", 1_000_500)).toBeNull();
  });
});
