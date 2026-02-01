import {describe, it, expect} from 'vitest';
import {render} from 'vitest-browser-svelte';
import {page, userEvent} from 'vitest/browser';
import BillPage from './+page.svelte';

describe('bill/+page.svelte', () => {
    it('should render error if data is invalid', async () => {
        const data = {
            ok: false as const,
            errors: ['Invalid link'],
            shared: null,
            config: null,
        };

        render(BillPage, {data});

        await expect.element(page.getByText('Invalid bill link')).toBeInTheDocument();
        await expect.element(page.getByText('Invalid link')).toBeInTheDocument();
    });

    it('should allow assigning an item to multiple payers and split evenly', async () => {
        const shared = {
            v: 1 as const,
            billName: 'Test Bill',
            countryCode: 'VN' as const,
            currencyNumeric: '704' as const,
            owner: {bank: 'VCB', accountNumber: '123'},
            items: [
                {id: 'pizza', name: 'Pizza', qty: 1, unitPrice: 1000}, // 1000
                {id: 'coke', name: 'Coke', qty: 3, unitPrice: 500}, // 1500
            ],
            extras: {tax: 0, tip: 0, discount: 0},
        };

        const data = {ok: true as const, errors: [] as string[], shared, config: null};

        render(BillPage, {data});

        // Header renders
        await expect.element(page.getByRole('heading', {name: 'Test Bill'})).toBeInTheDocument();

        // Stable "Pay to" block
        await expect.element(page.getByTestId('pay-to')).toHaveTextContent('VCB • 123');

        // On mount defaults payers to Alice/Bob and generates QR totals
        await expect.element(page.getByTestId('payer-amount-Alice')).toBeInTheDocument();
        await expect.element(page.getByTestId('payer-amount-Bob')).toBeInTheDocument();

        // Initial: Alice has all 2500
        await expect.element(page.getByTestId('payer-amount-Alice')).toHaveTextContent('2,500 VND');

        // There are 2 Bob checkboxes (one per item). Use aria name "Bob".
        const bobBoxes = page.getByRole('checkbox', {name: 'Bob'}).all();
        expect(bobBoxes.length).toBeGreaterThanOrEqual(2);

        // Share Pizza with Bob (1000 => 500/500)
        await userEvent.click(bobBoxes[0]);

        await expect.element(page.getByTestId('payer-amount-Alice')).toHaveTextContent('2,000 VND');
        await expect.element(page.getByTestId('payer-amount-Bob')).toHaveTextContent('500 VND');

        // Share Coke with Bob too (1500 => 750/750)
        await userEvent.click(bobBoxes[1]);

        await expect.element(page.getByTestId('payer-amount-Alice')).toHaveTextContent('1,250 VND');
        await expect.element(page.getByTestId('payer-amount-Bob')).toHaveTextContent('1,250 VND');
    });

    it('should split with integer rounding (remainder goes to first payer in payer order)', async () => {
        const shared = {
            v: 1 as const,
            billName: 'Rounding Bill',
            countryCode: 'VN' as const,
            currencyNumeric: '704' as const,
            owner: {bank: 'VCB', accountNumber: '123'},
            items: [{id: 'odd', name: 'Odd Item', qty: 1, unitPrice: 1001}],
            extras: {tax: 0, tip: 0, discount: 0},
        };

        const data = {ok: true as const, errors: [] as string[], shared, config: null};

        render(BillPage, {data});

        await expect
            .element(page.getByRole('heading', {name: 'Rounding Bill'}))
            .toBeInTheDocument();

        // Default: Alice has all 1001
        await expect.element(page.getByTestId('payer-amount-Alice')).toHaveTextContent('1,001 VND');

        // Click Bob checkbox for the only item (adds Bob to split)
        const bobBox = page
            .getByRole('row', {name: /Odd Item/})
            .getByRole('checkbox', {name: 'Bob'});
        await userEvent.click(bobBox);

        // With remainder to first payer (Alice first): 1001 => 501 / 500
        await expect.element(page.getByTestId('payer-amount-Alice')).toHaveTextContent('501 VND');
        await expect.element(page.getByTestId('payer-amount-Bob')).toHaveTextContent('500 VND');
    });
});
