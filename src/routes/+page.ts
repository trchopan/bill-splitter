import type {PageLoad} from './$types';

export const load: PageLoad = ({url}) => {
    const bank = url.searchParams.get('bank')?.trim() ?? '';
    const acct = url.searchParams.get('accountNumber')?.trim() ?? '';

    return {
        preset: {
            bank,
            acct,
        },
    };
};
