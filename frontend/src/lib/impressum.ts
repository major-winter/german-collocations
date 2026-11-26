// Decision #72: the operator's details for the Impressum and Datenschutz
// pages come from build-time variables, never from git (the repo is
// public). Production's Dockerfile refuses to build without them; local
// dev shows marked placeholders.

export interface Operator {
    name: string;
    addressLines: string[];
    email: string;
    /** True when any detail is missing, i.e. not a production build. */
    placeholder: boolean;
}

interface RawOperator {
    name: string | undefined;
    address: string | undefined; // lines separated by "|"
    email: string | undefined;
}

export function operatorOf(raw: RawOperator): Operator {
    const name = raw.name?.trim() ?? '';
    const addressLines = (raw.address ?? '').split('|').map((l) => l.trim()).filter((l) => l !== '');
    const email = raw.email?.trim() ?? '';
    return {
        name: name || '[Name]',
        addressLines: addressLines.length > 0 ? addressLines : ['[Straße und Hausnummer]', '[PLZ und Ort]'],
        email: email || '[E-Mail-Adresse]',
        placeholder: !name || addressLines.length === 0 || !email,
    };
}

export const OPERATOR: Operator = operatorOf({
    name: import.meta.env?.VITE_IMPRESSUM_NAME,
    address: import.meta.env?.VITE_IMPRESSUM_ADDRESS,
    email: import.meta.env?.VITE_IMPRESSUM_EMAIL,
});
