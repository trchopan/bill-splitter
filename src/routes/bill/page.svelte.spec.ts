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
                {id: 'pizza', name: 'Pizza', qty: 1, unitPrice: 1000}, // line 1000
                {id: 'coke', name: 'Coke', qty: 3, unitPrice: 500}, // line 1500
            ],
            extras: {tax: 0, tip: 0, discount: 0},
        };

        const data = {ok: true as const, errors: [] as string[], shared, config: null};

        render(BillPage, {data});

        // header renders
        await expect.element(page.getByRole('heading', {name: 'Test Bill'})).toBeInTheDocument();
        await expect.element(page.getByText('Pay to: VCB • 123')).toBeInTheDocument();

        // On mount defaults payers to Alice/Bob and assigns all items to Alice
        await expect.element(page.getByText('Alice').first()).toBeInTheDocument();
        await expect.element(page.getByText('Bob').first()).toBeInTheDocument();

        // Initial subtotals: Alice=2500, Bob=0
        await expect.element(page.getByText('2,500 VND').first()).toBeInTheDocument();

        // There are 2 Bob checkboxes (one per item). Order should match item order.
        const bobBoxesLocator = page.getByRole('checkbox', {name: 'Bob'});
        const bobBoxes = bobBoxesLocator.all();
        expect(bobBoxes.length).toBeGreaterThanOrEqual(2);

        // Share Pizza with Bob (Pizza 1000 -> 500/500)
        await userEvent.click(bobBoxes[0]);

        // Now Alice should have 500 (pizza) + 1500 (coke) = 2000
        // Bob should have 500
        await expect.element(page.getByText('2,000 VND').first()).toBeInTheDocument();
        await expect.element(page.getByText('500 VND').first()).toBeInTheDocument();

        // Share Coke with Bob too (Coke 1500 -> 750/750)
        await userEvent.click(bobBoxes[1]);

        // Now totals should be Alice 500+750=1250, Bob 500+750=1250
        await expect.element(page.getByText('1,250 VND').first()).toBeInTheDocument();
    });

    it('should split with integer rounding (remainder goes to first payer in payer order)', async () => {
        const shared = {
            v: 1 as const,
            billName: 'Rounding Bill',
            countryCode: 'VN' as const,
            currencyNumeric: '704' as const,
            owner: {bank: 'VCB', accountNumber: '123'},
            items: [
                {id: 'odd', name: 'Odd Item', qty: 1, unitPrice: 1001}, // split between 2 => 501 + 500
            ],
            extras: {tax: 0, tip: 0, discount: 0},
        };

        const data = {ok: true as const, errors: [] as string[], shared, config: null};

        render(BillPage, {data});

        await expect
            .element(page.getByRole('heading', {name: 'Rounding Bill'}))
            .toBeInTheDocument();

        // Default: Alice has all 1001
        await expect.element(page.getByText('1,001 VND').first()).toBeInTheDocument();

        // Click Bob checkbox for the only item
        const bobBox = page.getByRole('checkbox', {name: 'Bob'});
        await userEvent.click(bobBox);

        // With remainder policy (Alice first), Alice=501, Bob=500 should appear
        await expect.element(page.getByText('501 VND').first()).toBeInTheDocument();
        await expect.element(page.getByText('500 VND').first()).toBeInTheDocument();
    });
});
