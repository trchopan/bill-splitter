/**
 * Vietnam / NAPAS - EMVCo payload generator for personal transfers (IBFT-to-account).
 *
 * Key compatibility behaviors:
 * - TLV length is **grapheme length**, NOT UTF-8 byte length.
 * - Tag 62 is **always included**.
 * - Tag 62 always contains subtag 08, even when additional_data/note is empty -> "0800".
 * - Tag 01 is hardcoded to "12".
 * - Tag 53 is hardcoded to "704".
 * - Country code is NOT forced uppercase.
 * - Amount is used as provided (stringified), NOT truncated.
 * - CRC output is lowercase hex (common Exemvi behavior).
 *
 * Bank BIN list below is hard-coded.
 */

export type BankInput = {
    bank: string; // user-entered bank name, shortName, or code (e.g., "Vietcombank", "VCB", "BIDV", "Techcombank")
    accountNumber: string;
    amount: number | string; // e.g. 499000 or "499000" (VND) - will be stringified "as is"
    note?: string; // purpose/description
    countryCode?: string; // default "VN" (NOT auto-uppercased)
};

type Bank = {
    code: string; // e.g. "VCB"
    shortName: string; // e.g. "Vietcombank"
    name: string; // Vietnamese legal name
    bin: string; // e.g. "970436"
};

export const BANKS: Bank[] = [
    {
        code: 'ICB',
        shortName: 'VietinBank',
        name: 'Ngân hàng TMCP Công thương Việt Nam',
        bin: '970415',
    },
    {
        code: 'VCB',
        shortName: 'Vietcombank',
        name: 'Ngân hàng TMCP Ngoại Thương Việt Nam',
        bin: '970436',
    },
    {
        code: 'BIDV',
        shortName: 'BIDV',
        name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
        bin: '970418',
    },
    {
        code: 'VBA',
        shortName: 'Agribank',
        name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam',
        bin: '970405',
    },
    {code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông', bin: '970448'},
    {code: 'MB', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân đội', bin: '970422'},
    {
        code: 'TCB',
        shortName: 'Techcombank',
        name: 'Ngân hàng TMCP Kỹ thương Việt Nam',
        bin: '970407',
    },
    {code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu', bin: '970416'},
    {code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', bin: '970432'},
    {code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong', bin: '970423'},
    {code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín', bin: '970403'},
    {
        code: 'HDB',
        shortName: 'HDBank',
        name: 'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh',
        bin: '970437',
    },
    {code: 'VCCB', shortName: 'VietCapitalBank', name: 'Ngân hàng TMCP Bản Việt', bin: '970454'},
    {code: 'SCB', shortName: 'SCB', name: 'Ngân hàng TMCP Sài Gòn', bin: '970429'},
    {code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam', bin: '970441'},
    {code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội', bin: '970443'},
    {
        code: 'EIB',
        shortName: 'Eximbank',
        name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam',
        bin: '970431',
    },
    {code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam', bin: '970426'},
    {
        code: 'CAKE',
        shortName: 'CAKE',
        name: 'TMCP Việt Nam Thịnh Vượng - Ngân hàng số CAKE by VPBank',
        bin: '546034',
    },
    {
        code: 'Ubank',
        shortName: 'Ubank',
        name: 'TMCP Việt Nam Thịnh Vượng - Ngân hàng số Ubank by VPBank',
        bin: '546035',
    },
    {
        code: 'VTLMONEY',
        shortName: 'ViettelMoney',
        name: 'Tổng Công ty Dịch vụ số Viettel - Chi nhánh tập đoàn công nghiệp viễn thông Quân Đội',
        bin: '971005',
    },
    {
        code: 'TIMO',
        shortName: 'Timo',
        name: 'Ngân hàng số Timo by Ban Viet Bank (Timo by Ban Viet Bank)',
        bin: '963388',
    },
    {code: 'VNPTMONEY', shortName: 'VNPTMoney', name: 'VNPT Money', bin: '971011'},
    {
        code: 'SGICB',
        shortName: 'SaigonBank',
        name: 'Ngân hàng TMCP Sài Gòn Công Thương',
        bin: '970400',
    },
    {code: 'BAB', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á', bin: '970409'},
    {code: 'momo', shortName: 'MoMo', name: 'CTCP Dịch Vụ Di Động Trực Tuyến', bin: '971025'},
    {
        code: 'PVDB',
        shortName: 'PVcomBank Pay',
        name: 'Ngân hàng TMCP Đại Chúng Việt Nam Ngân hàng số',
        bin: '971133',
    },
    {
        code: 'PVCB',
        shortName: 'PVcomBank',
        name: 'Ngân hàng TMCP Đại Chúng Việt Nam',
        bin: '970412',
    },
    {code: 'MBV', shortName: 'MBV', name: 'Ngân hàng TNHH MTV Việt Nam Hiện Đại', bin: '970414'},
    {code: 'NCB', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân', bin: '970419'},
    {
        code: 'SHBVN',
        shortName: 'ShinhanBank',
        name: 'Ngân hàng TNHH MTV Shinhan Việt Nam',
        bin: '970424',
    },
    {code: 'ABB', shortName: 'ABBANK', name: 'Ngân hàng TMCP An Bình', bin: '970425'},
    {code: 'VAB', shortName: 'VietABank', name: 'Ngân hàng TMCP Việt Á', bin: '970427'},
    {code: 'NAB', shortName: 'NamABank', name: 'Ngân hàng TMCP Nam Á', bin: '970428'},
    {
        code: 'PGB',
        shortName: 'PGBank',
        name: 'Ngân hàng TMCP Thịnh vượng và Phát triển',
        bin: '970430',
    },
    {
        code: 'VIETBANK',
        shortName: 'VietBank',
        name: 'Ngân hàng TMCP Việt Nam Thương Tín',
        bin: '970433',
    },
    {code: 'BVB', shortName: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt', bin: '970438'},
    {code: 'SEAB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á', bin: '970440'},
    {code: 'COOPBANK', shortName: 'COOPBANK', name: 'Ngân hàng Hợp tác xã Việt Nam', bin: '970446'},
    {code: 'LPB', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam', bin: '970449'},
    {code: 'KLB', shortName: 'KienLongBank', name: 'Ngân hàng TMCP Kiên Long', bin: '970452'},
    {
        code: 'KBank',
        shortName: 'KBank',
        name: 'Ngân hàng Đại chúng TNHH Kasikornbank',
        bin: '668888',
    },
    {
        code: 'MAFC',
        shortName: 'MAFC',
        name: 'Công ty Tài chính TNHH MTV Mirae Asset (Việt Nam)',
        bin: '977777',
    },
    {
        code: 'HLBVN',
        shortName: 'HongLeong',
        name: 'Ngân hàng TNHH MTV Hong Leong Việt Nam',
        bin: '970442',
    },
    {
        code: 'KEBHANAHN',
        shortName: 'KEBHANAHN',
        name: 'Ngân hàng KEB Hana – Chi nhánh Hà Nội',
        bin: '970467',
    },
    {
        code: 'KEBHANAHCM',
        shortName: 'KEBHanaHCM',
        name: 'Ngân hàng KEB Hana – Chi nhánh Thành phố Hồ Chí Minh',
        bin: '970466',
    },
    {
        code: 'CITIBANK',
        shortName: 'Citibank',
        name: 'Ngân hàng Citibank, N.A. - Chi nhánh Hà Nội',
        bin: '533948',
    },
    {
        code: 'CBB',
        shortName: 'CBBank',
        name: 'Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam',
        bin: '970444',
    },
    {code: 'CIMB', shortName: 'CIMB', name: 'Ngân hàng TNHH MTV CIMB Việt Nam', bin: '422589'},
    {
        code: 'DBS',
        shortName: 'DBSBank',
        name: 'DBS Bank Ltd - Chi nhánh Thành phố Hồ Chí Minh',
        bin: '796500',
    },
    {code: 'Vikki', shortName: 'Vikki', name: 'Ngân hàng TNHH MTV Số Vikki', bin: '970406'},
    {code: 'VBSP', shortName: 'VBSP', name: 'Ngân hàng Chính sách Xã hội', bin: '999888'},
    {
        code: 'GPB',
        shortName: 'GPBank',
        name: 'Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu',
        bin: '970408',
    },
    {
        code: 'KBHCM',
        shortName: 'KookminHCM',
        name: 'Ngân hàng Kookmin - Chi nhánh Thành phố Hồ Chí Minh',
        bin: '970463',
    },
    {
        code: 'KBHN',
        shortName: 'KookminHN',
        name: 'Ngân hàng Kookmin - Chi nhánh Hà Nội',
        bin: '970462',
    },
    {code: 'WVN', shortName: 'Woori', name: 'Ngân hàng TNHH MTV Woori Việt Nam', bin: '970457'},
    {code: 'VRB', shortName: 'VRB', name: 'Ngân hàng Liên doanh Việt - Nga', bin: '970421'},
    {code: 'HSBC', shortName: 'HSBC', name: 'Ngân hàng TNHH MTV HSBC (Việt Nam)', bin: '458761'},
    {
        code: 'IBK - HN',
        shortName: 'IBKHN',
        name: 'Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh Hà Nội',
        bin: '970455',
    },
    {
        code: 'IBK - HCM',
        shortName: 'IBKHCM',
        name: 'Ngân hàng Công nghiệp Hàn Quốc - Chi nhánh TP. Hồ Chí Minh',
        bin: '970456',
    },
    {code: 'IVB', shortName: 'IndovinaBank', name: 'Ngân hàng TNHH Indovina', bin: '970434'},
    {
        code: 'UOB',
        shortName: 'UnitedOverseas',
        name: 'Ngân hàng United Overseas - Chi nhánh TP. Hồ Chí Minh',
        bin: '970458',
    },
    {
        code: 'NHB HN',
        shortName: 'Nonghyup',
        name: 'Ngân hàng Nonghyup - Chi nhánh Hà Nội',
        bin: '801011',
    },
    {
        code: 'SCVN',
        shortName: 'StandardChartered',
        name: 'Ngân hàng TNHH MTV Standard Chartered Bank Việt Nam',
        bin: '970410',
    },
    {
        code: 'PBVN',
        shortName: 'PublicBank',
        name: 'Ngân hàng TNHH MTV Public Việt Nam',
        bin: '970439',
    },
];

function normalizeBankKey(s: string): string {
    // Lowercase, remove diacritics, collapse spaces/punctuation.
    return s
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ');
}

export function resolveBankBin(userBankInput: string): Bank {
    const key = normalizeBankKey(userBankInput);

    const found =
        BANKS.find(b => normalizeBankKey(b.code) === key) ??
        BANKS.find(b => normalizeBankKey(b.shortName) === key) ??
        BANKS.find(b => normalizeBankKey(b.name) === key) ??
        BANKS.find(
            b =>
                normalizeBankKey(b.name).includes(key) ||
                normalizeBankKey(b.shortName).includes(key)
        );

    if (!found) {
        throw new Error(
            `Unknown bank: "${userBankInput}". You must map bank name/code to a Bank BIN (e.g., Vietcombank=970436).`
        );
    }
    return found;
}

function graphemeLength(str: string): number {
    const AnyIntl: any = Intl as any;
    if (typeof AnyIntl?.Segmenter === 'function') {
        const seg = new AnyIntl.Segmenter(undefined, {granularity: 'grapheme'});
        let count = 0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _ of seg.segment(str)) count++;
        return count;
    }
    return Array.from(str).length;
}

function pad2OrMore(n: number): string {
    const s = String(n);
    return s.length >= 2 ? s : '0' + s;
}

/**
 * EMV TLV: Tag (2 chars) + Length (>=2 chars, decimal) + Value
 */
function tlv(tag: string, value: string): string {
    if (!/^\d{2}$/.test(tag)) throw new Error(`TLV tag must be 2 digits. Got: ${tag}`);
    const len = graphemeLength(value);
    return `${tag}${pad2OrMore(len)}${value}`;
}

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), output 4-hex (lowercase).
 * This matches common Exemvi.CRC.checksum_hex output casing.
 */
export function crc16CcittFalseHexLower(payloadAscii: string): string {
    const bytes = new TextEncoder().encode(payloadAscii);

    let crc = 0xffff;
    for (const b of bytes) {
        crc ^= b << 8;
        for (let i = 0; i < 8; i++) {
            crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
            crc &= 0xffff;
        }
    }
    return crc.toString(16).toLowerCase().padStart(4, '0');
}

/**
 * Build Tag 38 (Merchant Account Information) value for QR personal transfer.
 * Uses:
 * - GUI: A000000727
 * - Beneficiary template: bank BIN + account + QRIBFTTA
 */
export function buildQrReceiveAccount(bankBin: string, accountNumber: string): string {
    if (!/^\d{6}$/.test(bankBin)) {
        throw new Error(`bankBin must be 6 digits (e.g., "970436"). Got: ${bankBin}`);
    }
    const acct = accountNumber.trim();
    if (!acct || !/^[0-9]+$/.test(acct)) {
        throw new Error(`accountNumber must be numeric. Got: ${accountNumber}`);
    }

    const beneficiary = tlv('00', bankBin) + tlv('01', acct) + tlv('02', 'QRIBFTTA');

    return tlv('00', 'A000000727') + tlv('01', beneficiary);
}

/**
 * Equivalent to:
 *   generate_emvco_code(merchant_account, amount, country_code, additional_data)
 *
 * Behaviors:
 * - Tag 01 = "12"
 * - Tag 53 = "704"
 * - Tag 62 ALWAYS present, containing Tag 08 (may be empty -> 0800)
 * - Country code defaults to "VN" but NOT forced uppercase
 * - Amount is String(input.amount) without truncation/validation
 */
export function generateQrEmvPayload(input: BankInput): {
    payload: string;
    bank: Bank;
} {
    const bank = resolveBankBin(input.bank);

    const merchantAccount = buildQrReceiveAccount(bank.bin, input.accountNumber);

    const amountStr = String(input.amount);
    const countryCode = input.countryCode ?? 'VN';

    const additionalData = input.note ?? '';
    const encodedAdditionalData = tlv('08', additionalData);

    const allTags: string[] = [
        tlv('00', '01'),
        tlv('01', '12'),
        tlv('38', merchantAccount),
        tlv('53', '704'),
        tlv('54', amountStr),
        tlv('58', countryCode),
        tlv('62', encodedAdditionalData),
    ];

    const payloadWithoutCrc = allTags.join('');

    // Compute CRC over payload + "6304" placeholder
    const crcInput = `${payloadWithoutCrc}6304`;
    const crc = crc16CcittFalseHexLower(crcInput);

    const payload = `${payloadWithoutCrc}6304${crc}`;
    return {payload, bank};
}

/**
 * Convenience: if you want to show the list in your UI.
 */
export function getBankList(): Bank[] {
    return [...BANKS];
}
