import { afterEach, describe, expect, it, vi } from "vitest";
import { uid } from "../defaults";

describe("uid", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("works without crypto.randomUUID (plain HTTP)", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (b: Uint8Array<ArrayBuffer>) => real.getRandomValues(b) });
    const ids = new Set(Array.from({ length: 1000 }, uid));
    expect(ids.size).toBe(1000);
    for (const id of [...ids].slice(0, 20)) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("works with no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    expect(uid()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
