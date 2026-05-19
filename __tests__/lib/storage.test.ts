import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storage } from "../../lib/storage";

class LocalStorageMock {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

describe("user-scoped storage", () => {
  let localStorageMock: LocalStorageMock;

  beforeEach(() => {
    localStorageMock = new LocalStorageMock();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: localStorageMock },
      configurable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });
    storage.onSignOut();
    localStorageMock.clear();
  });

  afterEach(() => {
    storage.onSignOut();
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("does not expose one user's plan or action cache to another account on the same device", () => {
    storage.onSignIn("user-a");
    storage.setPlan("builder");
    storage.setJSON("bm_today_action", { action: "A's action" });

    storage.onSignIn("user-b");

    expect(storage.getPlan()).toBeNull();
    expect(storage.getJSON("bm_today_action", null)).toBeNull();
    expect(localStorageMock.getItem("bm_plan")).toBeNull();
  });

  it("ignores legacy unscoped user data once an authenticated user is known", () => {
    localStorageMock.setItem("bm_plan", "builder");
    localStorageMock.setItem("bm_today_action", JSON.stringify({ action: "legacy action" }));

    storage.onSignIn("user-b");

    expect(storage.getPlan()).toBeNull();
    expect(storage.getJSON("bm_today_action", null)).toBeNull();
    expect(localStorageMock.getItem("bm_plan")).toBeNull();
    expect(localStorageMock.getItem("bm_today_action")).toBeNull();
  });
});
