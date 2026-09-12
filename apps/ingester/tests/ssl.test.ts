import { describe, expect, it } from "vitest";
import {
  createPool,
  describeUrlShape,
  sslForConnectionString,
  stripSslQueryParams,
} from "../src/db.js";

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

describe("stripSslQueryParams", () => {
  it("removes sslmode so Pool ssl is not overridden", () => {
    expect(
      stripSslQueryParams(
        "postgresql://u:p@host:5432/db?sslmode=require&application_name=cex",
      ),
    ).toBe("postgresql://u:p@host:5432/db?application_name=cex");
  });

  it("preserves passwords with reserved characters (no URL rebuild)", () => {
    const raw =
      "postgresql://tsdbadmin:p%40ss%23word@xyz.tsdb.cloud:5432/tsdb?sslmode=require";
    expect(stripSslQueryParams(raw)).toBe(
      "postgresql://tsdbadmin:p%40ss%23word@xyz.tsdb.cloud:5432/tsdb",
    );
  });

  it("drops a lone sslmode query string entirely", () => {
    expect(
      stripSslQueryParams(
        "postgresql://u:p@host:5432/db?sslmode=require",
      ),
    ).toBe("postgresql://u:p@host:5432/db");
  });
});

describe("createPool", () => {
  it("builds a pool with relaxed ssl for remote require URLs", () => {
    const pool = createPool(
      "postgresql://u:p@abc.xx.tsdb.cloud:5432/tsdb?sslmode=require",
    );
    expect(pool).toBeTruthy();
    void pool.end();
  });

  it("rejects remote URLs without a password before SCRAM", () => {
    expect(() =>
      createPool("postgresql://tsdbadmin@abc.xx.tsdb.cloud:5432/tsdb"),
    ).toThrow(/no password/i);
    expect(() =>
      createPool("postgresql://tsdbadmin@abc.xx.tsdb.cloud:5432/tsdb"),
    ).toThrow(/userinfo=user-only/);
  });

  it("strips wrapping quotes from pasted env values", () => {
    const pool = createPool(
      '"postgresql://u:p@abc.xx.tsdb.cloud:5432/tsdb?sslmode=require"',
    );
    expect(pool).toBeTruthy();
    void pool.end();
  });
});

describe("describeUrlShape", () => {
  it("classifies user-only vs user+password without leaking secrets", () => {
    expect(
      describeUrlShape("postgresql://tsdbadmin@host:5432/tsdb"),
    ).toMatch(/userinfo=user-only/);
    expect(
      describeUrlShape("postgresql://tsdbadmin:s3cret@host:5432/tsdb"),
    ).toMatch(/userinfo=user\+password/);
    expect(
      describeUrlShape("postgresql://tsdbadmin:s3cret@host:5432/tsdb"),
    ).not.toMatch(/s3cret/);
  });
});
