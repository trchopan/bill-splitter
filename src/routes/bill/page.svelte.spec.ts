import {describe, it, expect, vi} from 'vitest';
import {render} from 'vitest-browser-svelte';
import {page, userEvent} from 'vitest/browser';
import BillPage from './+page.svelte';

describe('bill/+page.svelte', () => {
    it('should render error if data is invalid', async () => {
        const data = {
            ok: false as const,
            errors: ['Invalid link'],
            shared: null,
        };
        render(BillPage, {data});
        await expect.element(page.getByText('Invalid bill link')).toBeInTheDocument();
        await expect.element(page.getByText('Invalid link')).toBeInTheDocument();
    });

    it('should render bill details and allow selection', async () => {
        const shared = {
            v: 1 as const,
            billName: 'Test Bill',
            countryCode: 'VN' as const,
            currencyNumeric: '704' as const,
            owner: {bank: 'VCB', accountNumber: '123'},
            items: [
                {id: '1', name: 'Item 1', qty: 2, unitPrice: 1000},
                {id: '2', name: 'Item 2', qty: 1, unitPrice: 2000},
            ],
            extras: {tax: 0, tip: 0, discount: 0},
        };
        const data = {ok: true as const, errors: [], shared};

        render(BillPage, {data});

        await expect.element(page.getByRole('heading', {name: 'Test Bill'})).toBeInTheDocument();
        await expect.element(page.getByText('Pay to: VCB • 123')).toBeInTheDocument();

        // Initial state: 0 selected
        await expect.element(page.getByText('Total to pay: 0 VND')).toBeInTheDocument();

        // Select Item 1 (qty 2 available)
        // Find the row for Item 1.
        // We can find by text "Item 1", then find the + button near it.
        // Since test structure is simple, we can use aria-labels or just traversal if possible,
        // but the component doesn't have specific aria-labels.
        // We'll rely on the text content and button proximity or order.
        
        // Let's just find all "+" buttons.
        const incButtons = page.getByRole('button', {name: '+'});
        const incItem1 = incButtons.all()[0]; // First item

        await userEvent.click(incItem1);
        
        // Should update totals. Item 1 price is 1000.
        await expect.element(page.getByText('Total to pay: 1,000 VND')).toBeInTheDocument();
        
        await userEvent.click(incItem1);
        // Total 2000
        await expect.element(page.getByText('Total to pay: 2,000 VND')).toBeInTheDocument();
    });

    it('should calculate extras share correctly', async () => {
        const shared = {
            v: 1 as const,
            billName: 'Extras Bill',
            countryCode: 'VN' as const,
            currencyNumeric: '704' as const,
            owner: {bank: 'VCB', accountNumber: '123'},
            items: [
                {id: '1', name: 'Item 1', qty: 1, unitPrice: 1000},
            ],
            extras: {tax: 100, tip: 0, discount: 0}, // 10% effectively
        };
        const data = {ok: true as const, errors: [], shared};

        render(BillPage, {data});

        // Select the item
        const incButton = page.getByRole('button', {name: '+'});
        await userEvent.click(incButton);

        // Subtotal: 1000. Extras: 100. Total: 1100.
        await expect.element(page.getByText('Total to pay: 1,100 VND')).toBeInTheDocument();
        await expect.element(page.getByText('Extras share: 100 VND')).toBeInTheDocument();
    });
});
