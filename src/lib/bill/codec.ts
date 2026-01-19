import {encode as msgpackEncode, decode as msgpackDecode} from '@msgpack/msgpack';
import {deflateSync, inflateSync} from 'fflate';
import type {SharedBillPayload} from './types';

// Schema version 1
// P = [
//   v,             // 0
//   billName,      // 1
//   countryCode,   // 2
//   currencyNumeric, // 3
//   [bank, accountNumber], // 4 owner
//   itemsPacked,   // 5
//   [tax, tip, discount] // 6 extras (nullable)
// ]
// itemsPacked entries: [itemId, itemName, qty, unitPrice]

type PackedItem = [string, string, number, number];
type PackedExtras = [number | null, number | null, number | null]; // tax, tip, discount
type PackedPayload = [
    number, // v
    string, // billName
    string, // countryCode
    number, // currencyNumeric
    [string, string], // owner
    PackedItem[], // items
    PackedExtras | null, // extras
];

function pack(o: SharedBillPayload): PackedPayload {
    const itemsPacked: PackedItem[] = o.items.map(i => [i.id, i.name, i.qty, i.unitPrice]);
    
    let extrasPacked: PackedExtras | null = null;
    if (o.extras) {
        extrasPacked = [
            o.extras.tax ?? null,
            o.extras.tip ?? null,
            o.extras.discount ?? null
        ];
    }

    return [
        o.v,
        o.billName,
        o.countryCode,
        Number(o.currencyNumeric),
        [o.owner.bank, o.owner.accountNumber],
        itemsPacked,
        extrasPacked
    ];
}

function unpack(p: PackedPayload): SharedBillPayload {
    const [v, billName, countryCode, currencyNumeric, owner, items, extras] = p;

    if (v !== 1) {
        throw new Error(`Unsupported schema version: ${v}`);
    }

    const result: SharedBillPayload = {
        v: 1,
        billName,
        countryCode: countryCode as 'VN',
        currencyNumeric: String(currencyNumeric) as '704',
        owner: {
            bank: owner[0],
            accountNumber: owner[1]
        },
        items: items.map(x => ({
            id: x[0],
            name: x[1],
            qty: x[2],
            unitPrice: x[3]
        })),
    };

    if (extras) {
        result.extras = {};
        if (extras[0] !== null) result.extras.tax = extras[0];
        if (extras[1] !== null) result.extras.tip = extras[1];
        if (extras[2] !== null) result.extras.discount = extras[2];
        
        // Remove extras if empty (optional cleanup, but keeps it clean)
        if (Object.keys(result.extras).length === 0) {
            delete result.extras;
        }
    }

    return result;
}

function base64urlEncode(data: Uint8Array): string {
    let str = '';
    for (let i = 0; i < data.length; i++) {
        str += String.fromCharCode(data[i]);
    }
    return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    const bin = atob(str);
    const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        data[i] = bin.charCodeAt(i);
    }
    return data;
}

export function encodeForUrl(payload: SharedBillPayload): string {
    const packed = pack(payload);
    const msg = msgpackEncode(packed);
    const compressed = deflateSync(msg, {level: 9});
    return base64urlEncode(compressed);
}

export function decodeFromUrl(token: string): SharedBillPayload {
    const compressed = base64urlDecode(token);
    const msg = inflateSync(compressed);
    const packed = msgpackDecode(msg) as PackedPayload;
    return unpack(packed);
}
