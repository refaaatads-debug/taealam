import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRpc, mockUser } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockUser: { current: null as null | { id: string } },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser.current }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mockRpc },
}));

import { useInPersonFeatureGate } from "./useInPersonFeatureGate";

describe("useInPersonFeatureGate", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockUser.current = { id: "test-user" };
  });

  it("enables only when the server confirms the signed-in user is allowed", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => useInPersonFeatureGate());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith("is_in_person_test_user");
    expect(result.current.enabled).toBe(true);
  });

  it("fails closed on an RPC error", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("not authorized") });

    const { result } = renderHook(() => useInPersonFeatureGate());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.enabled).toBe(false);
  });

  it("does not call the server for a signed-out visitor", async () => {
    mockUser.current = null;

    const { result } = renderHook(() => useInPersonFeatureGate());
    await act(async () => Promise.resolve());

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});
