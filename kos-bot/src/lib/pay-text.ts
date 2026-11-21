/**
 * The ready-made chat messages behind every "get payment details" button. The
 * assistant recognises the invoice code in them and replies with the bank
 * details (tool get_payment_details).
 */
export function depositPayText(reference: string, invoiceCode: string) {
  return `Halo, saya mau bayar deposit untuk pendaftaran ${reference} (tagihan ${invoiceCode}). Boleh minta info rekeningnya?`;
}

export function billPayText(invoiceCode: string, description: string) {
  return `Halo, saya mau bayar tagihan ${invoiceCode} (${description}). Boleh minta info rekeningnya?`;
}
