import { describe, expect, it } from "vitest";
import { sslForConnectionString } from "../src/db.js";

describe("sslForConnectionString", () => {
  it("leaves local Docker Timescale without forced SSL", () => {
    expect(
      sslForConnectionString(
        "postgresql://cex:cex@127.0.0.1:5434/cex_md",
        {},
      ),
    ).toBeUndefined();
    expect(
      sslForConnectionString(
        "postgresql://cex:cex@localhost:5434/cex_md",
        {},
      ),
    ).toBeUndefined();
  });

  it("relaxes CA checks for remote managed URLs (TigerCloud / sslmode=require)", () => {
    expect(
      sslForConnectionString(
        "postgresql://u:p@abc.xx.tsdb.cloud:5432/tsdb?sslmode=require",
        {},
      ),
    ).toEqual({ rejectUnauthorized: false });
    expect(
      sslForConnectionString(
        "postgresql://u:p@abc.xx.tsdb.cloud:5432/tsdb",
        {},
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("honors TIMESCALE_SSL_REJECT_UNAUTHORIZED overrides", () => {
    expect(
      sslForConnectionString(
        "postgresql://u:p@abc.xx.tsdb.cloud:5432/tsdb",
        { TIMESCALE_SSL_REJECT_UNAUTHORIZED: "true" },
      ),
    ).toEqual({ rejectUnauthorized: true });
    expect(
      sslForConnectionString(
        "postgresql://cex:cex@127.0.0.1:5434/cex_md",
        { TIMESCALE_SSL_REJECT_UNAUTHORIZED: "false" },
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("honors sslmode=verify-full and sslmode=disable", () => {
    expect(
      sslForConnectionString(
        "postgresql://u:p@abc.xx.tsdb.cloud:5432/tsdb?sslmode=verify-full",
        {},
      ),
    ).toEqual({ rejectUnauthorized: true });
    expect(
      sslForConnectionString(
        "postgresql://u:p@abc.xx.tsdb.cloud:5432/tsdb?sslmode=disable",
        {},
      ),
    ).toBe(false);
  });
});
