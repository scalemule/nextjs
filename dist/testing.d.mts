import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { U as User, N as StorageFile, A as ApiError } from './index-jomBa89d.mjs';

interface MockUserOptions {
    id?: string;
    email?: string;
    email_verified?: boolean;
    phone?: string | null;
    phone_verified?: boolean;
    full_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
    status?: 'active' | 'suspended' | 'pending_verification';
    created_at?: string;
}
declare function createMockUser(options?: MockUserOptions): User;
interface MockFileOptions {
    id?: string;
    filename?: string;
    content_type?: string;
    size_bytes?: number;
    is_public?: boolean;
    created_at?: string;
    scan_status?: string;
    url?: string;
}
declare function createMockFile(options?: MockFileOptions): StorageFile;
interface MockClientConfig {
    /** Simulated responses for specific paths (return value, not wrapped) */
    responses?: Record<string, unknown>;
    /** Default delay in ms (simulates network latency) */
    delay?: number;
    /** Whether to simulate errors */
    simulateErrors?: boolean;
}
declare class MockScaleMuleClient {
    private responses;
    private delay;
    private simulateErrors;
    constructor(config?: MockClientConfig);
    private simulateDelay;
    initialize(): Promise<void>;
    setSession(): Promise<void>;
    clearSession(): Promise<void>;
    getSessionToken(): string | null;
    getUserId(): string | null;
    isAuthenticated(): boolean;
    request<T>(path: string): Promise<T>;
    get<T>(path: string): Promise<T>;
    post<T>(path: string): Promise<T>;
    patch<T>(path: string): Promise<T>;
    put<T>(path: string): Promise<T>;
    delete<T>(path: string): Promise<T>;
    upload<T>(): Promise<T>;
}
interface MockScaleMuleContextValue {
    client: MockScaleMuleClient;
    user: User | null;
    setUser: (user: User | null) => void;
    initializing: boolean;
    error: ApiError | null;
    setError: (error: ApiError | null) => void;
}
interface MockScaleMuleProviderProps {
    children: ReactNode;
    /** Initial user (null = not logged in) */
    user?: User | null;
    /** Initial loading state */
    initializing?: boolean;
    /** Initial error */
    error?: ApiError | null;
    /** Mock client config */
    clientConfig?: MockClientConfig;
}
/**
 * Mock provider for testing ScaleMule hooks
 *
 * @example
 * ```tsx
 * // Test authenticated state
 * render(
 *   <MockScaleMuleProvider user={createMockUser()}>
 *     <MyComponent />
 *   </MockScaleMuleProvider>
 * )
 *
 * // Test loading state
 * render(
 *   <MockScaleMuleProvider initializing={true}>
 *     <MyComponent />
 *   </MockScaleMuleProvider>
 * )
 *
 * // Test error state
 * render(
 *   <MockScaleMuleProvider error={{ code: 'TEST', message: 'Error' }}>
 *     <MyComponent />
 *   </MockScaleMuleProvider>
 * )
 * ```
 */
declare function MockScaleMuleProvider({ children, user: initialUser, initializing: initialInitializing, error: initialError, clientConfig, }: MockScaleMuleProviderProps): react_jsx_runtime.JSX.Element;
/**
 * Hook to use mock context (for testing hook internals)
 */
declare function useMockScaleMule(): MockScaleMuleContextValue;

export { type MockClientConfig, type MockFileOptions, MockScaleMuleClient, MockScaleMuleProvider, type MockScaleMuleProviderProps, type MockUserOptions, createMockFile, createMockUser, useMockScaleMule };
