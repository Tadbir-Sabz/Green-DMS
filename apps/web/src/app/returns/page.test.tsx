import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ReturnsPage from "./page";

const apiMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    GET: (...args: unknown[]) => apiMock(...args),
    POST: (...args: unknown[]) => apiMock(...args),
  },
  getToken: () => "test-token",
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div dir="rtl" data-testid="app-shell">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/components/EntityAttachments", () => ({
  EntityAttachments: () => <div data-testid="entity-attachments" />,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "u-1", roles: ["accountant"], permissions: ["*"] }, loading: false, hasPermission: () => true }),
}));

vi.mock("@/lib/permissions", () => ({
  useHasPermission: () => () => true,
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ReturnsPage />
    </QueryClientProvider>,
  );
}

describe("ReturnsPage — Return Management UI", () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (path: string) => {
      if (path === "/returns") {
        return {
          data: {
            items: [
              {
                id: "ret-1",
                doc_number: "RET-1404-001",
                customer_id: "cust-1",
                reason_code: "damaged",
                status: "posted",
                financial_status: "credit_note_issued",
                valuation_status: "unresolved",
                credit_note_id: "cn-1",
                credit_note: {
                  id: "cn-1",
                  doc_number: "CN-1404-001",
                  amount: "100.00",
                  status: "posted",
                },
              },
              {
                id: "ret-2",
                doc_number: "RET-1404-002",
                customer_id: "cust-2",
                reason_code: "wrong_item",
                status: "draft",
                financial_status: "not_eligible",
                valuation_status: "unresolved",
                credit_note: null,
              },
            ],
          },
        };
      }
      if (path === "/returns/{id}") {
        return {
          data: {
            id: "ret-1",
            doc_number: "RET-1404-001",
            customer_id: "cust-1",
            reason_code: "damaged",
            status: "posted",
            financial_status: "credit_note_issued",
            valuation_status: "unresolved",
            credit_note: {
              id: "cn-1",
              doc_number: "CN-1404-001",
              amount: "100.00",
              status: "posted",
            },
            lines: [
              {
                id: "line-1",
                product_id: "prod-1",
                qty: 2,
                qty_approved: 2,
                unit_price: "50.00",
                disposition: "restock",
              },
            ],
          },
        };
      }
      return { data: {} };
    });
  });

  it("renders Persian-first RTL return list and filters by search", async () => {
    renderPage();
    expect(screen.getByText("درخواست‌های مرجوعی")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("RET-1404-001")).toBeTruthy();
      expect(screen.getByText("RET-1404-002")).toBeTruthy();
    });

    const searchInput = screen.getByLabelText("جستجوی مرجوعی");
    fireEvent.change(searchInput, { target: { value: "001" } });

    expect(screen.getByText("RET-1404-001")).toBeTruthy();
    expect(screen.queryByText("RET-1404-002")).toBeNull();
  });

  it("displays return detail with Credit Note AR status and unresolved valuation", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("RET-1404-001")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("RET-1404-001"));

    await waitFor(() => {
      expect(screen.getByText("#CN-1404-001")).toBeTruthy();
      expect(screen.getByText("100.00")).toBeTruthy();
    });
  });
});
