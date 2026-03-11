import { createContext, useState, useMemo, useContext } from 'react';
import { jsx } from 'react/jsx-runtime';

// src/types/index.ts
var ScaleMuleApiError = class extends Error {
  constructor(error) {
    super(error.message);
    this.name = "ScaleMuleApiError";
    this.code = error.code;
    this.field = error.field;
  }
};
function createMockUser(options = {}) {
  return {
    id: options.id ?? "mock-user-id-123",
    email: options.email ?? "test@example.com",
    email_verified: options.email_verified ?? true,
    phone: options.phone ?? null,
    phone_verified: options.phone_verified ?? false,
    full_name: options.full_name ?? "Test User",
    username: options.username ?? null,
    avatar_url: options.avatar_url ?? null,
    status: options.status ?? "active",
    created_at: options.created_at ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function createMockFile(options = {}) {
  const id = options.id ?? `mock-file-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    filename: options.filename ?? "test-file.jpg",
    content_type: options.content_type ?? "image/jpeg",
    size_bytes: options.size_bytes ?? 1024,
    is_public: options.is_public ?? false,
    created_at: options.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
    scan_status: options.scan_status ?? "clean",
    url: options.url ?? `https://storage.scalemule.com/files/${id}`
  };
}
var MockScaleMuleClient = class {
  constructor(config = {}) {
    this.responses = config.responses ?? {};
    this.delay = config.delay ?? 0;
    this.simulateErrors = config.simulateErrors ?? false;
  }
  async simulateDelay() {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }
  }
  async initialize() {
    await this.simulateDelay();
  }
  async setSession() {
    await this.simulateDelay();
  }
  async clearSession() {
    await this.simulateDelay();
  }
  getSessionToken() {
    return "mock-session-token";
  }
  getUserId() {
    return "mock-user-id";
  }
  isAuthenticated() {
    return true;
  }
  async request(path) {
    await this.simulateDelay();
    if (this.simulateErrors) {
      throw new ScaleMuleApiError({ code: "MOCK_ERROR", message: "Simulated error" });
    }
    if (this.responses[path] !== void 0) {
      return this.responses[path];
    }
    return {};
  }
  async get(path) {
    return this.request(path);
  }
  async post(path) {
    return this.request(path);
  }
  async patch(path) {
    return this.request(path);
  }
  async put(path) {
    return this.request(path);
  }
  async delete(path) {
    return this.request(path);
  }
  async upload() {
    await this.simulateDelay();
    return {};
  }
};
var MockScaleMuleContext = createContext(null);
function MockScaleMuleProvider({
  children,
  user: initialUser = null,
  initializing: initialInitializing = false,
  error: initialError = null,
  clientConfig
}) {
  const [user, setUser] = useState(initialUser);
  const [error, setError] = useState(initialError);
  const client = useMemo(
    () => new MockScaleMuleClient(clientConfig),
    [clientConfig]
  );
  const value = useMemo(
    () => ({
      client,
      user,
      setUser,
      initializing: initialInitializing,
      error,
      setError
    }),
    [client, user, initialInitializing, error]
  );
  return /* @__PURE__ */ jsx(MockScaleMuleContext.Provider, { value, children });
}
function useMockScaleMule() {
  const context = useContext(MockScaleMuleContext);
  if (!context) {
    throw new Error("useMockScaleMule must be used within MockScaleMuleProvider");
  }
  return context;
}

export { MockScaleMuleClient, MockScaleMuleProvider, createMockFile, createMockUser, useMockScaleMule };
