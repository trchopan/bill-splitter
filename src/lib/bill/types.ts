export type AiBillInput = {
    billName: string;
    items: Array<{
        name: string;
        qty: number;
        unitPrice: number;
    }>;
    extras?: {
        tax?: number;
        tip?: number;
        discount?: number;
    };
};

export type SharedBillPayload = {
    v: 1;
    billName: string;
    countryCode: 'VN';
    currencyNumeric: '704';
    owner: {
        bank: string;
        accountNumber: string;
    };
    items: Array<{
        id: string;
        name: string;
        qty: number;
        unitPrice: number;
    }>;
    extras?: {
        tax?: number;
        tip?: number;
        discount?: number;
    };
};
