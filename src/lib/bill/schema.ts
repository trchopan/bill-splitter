export const receiptBillSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://yourapp.local/schemas/receipt-bill.v1.json',
    title: 'ReceiptBillAIOutputV1',
    type: 'object',
    additionalProperties: false,
    required: ['billName', 'items'],
    properties: {
        billName: {type: 'string', minLength: 1, maxLength: 80},
        items: {
            type: 'array',
            minItems: 1,
            maxItems: 200,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['name', 'qty', 'unitPrice'],
                properties: {
                    name: {type: 'string', minLength: 1, maxLength: 120},
                    qty: {type: 'integer', minimum: 1, maximum: 999},
                    unitPrice: {type: 'integer', minimum: 0, maximum: 100000000},
                },
            },
        },
        extras: {
            type: 'object',
            additionalProperties: false,
            properties: {
                tax: {type: 'integer', minimum: 0, maximum: 100000000},
                tip: {type: 'integer', minimum: 0, maximum: 100000000},
                discount: {type: 'integer', minimum: 0, maximum: 100000000},
            },
        },
    },
} as const;
