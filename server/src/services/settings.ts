import type { HydratedDocument } from 'mongoose';
import { ShopSettings, type IShopSettings } from '../models/operations.js';

const DEFAULT_PAYMENT_METHODS: IShopSettings['paymentMethods'] = [
  {
    key: 'cash_on_delivery',
    label: 'Cash on Delivery',
    type: 'cash',
    enabled: true,
    instructions: 'Pay the rider in cash when your order arrives.',
    requiresReference: false,
    manualVerification: false,
  },
  {
    key: 'cash_at_shop',
    label: 'Cash at Shop',
    type: 'cash',
    enabled: true,
    instructions: 'Collect your order and pay at the HILAAL shop.',
    requiresReference: false,
    manualVerification: false,
  },
  {
    key: 'evc_plus',
    label: 'EVC Plus',
    type: 'mobile_money',
    enabled: true,
    instructions:
      'Send payment to +252 61 000 0000 and enter the transaction reference. Payments are verified manually by our team.',
    requiresReference: true,
    manualVerification: true,
  },
  {
    key: 'zaad',
    label: 'ZAAD',
    type: 'mobile_money',
    enabled: true,
    instructions:
      'Send payment to +252 63 000 0000 and enter the transaction reference. Payments are verified manually by our team.',
    requiresReference: true,
    manualVerification: true,
  },
  {
    key: 'sahal',
    label: 'Sahal',
    type: 'mobile_money',
    enabled: true,
    instructions:
      'Send payment to +252 62 000 0000 and enter the transaction reference. Payments are verified manually by our team.',
    requiresReference: true,
    manualVerification: true,
  },
  {
    key: 'edahab',
    label: 'eDahab',
    type: 'mobile_money',
    enabled: true,
    instructions:
      'Send payment to +252 65 000 0000 and enter the transaction reference. Payments are verified manually by our team.',
    requiresReference: true,
    manualVerification: true,
  },
];

export async function getSettings(): Promise<HydratedDocument<IShopSettings>> {
  let settings = await ShopSettings.findOne({ key: 'main' });
  if (!settings) {
    settings = await ShopSettings.create({
      key: 'main',
      paymentMethods: DEFAULT_PAYMENT_METHODS,
    });
  }
  return settings;
}

export async function getPublicSettings() {
  const settings = await getSettings();
  return {
    shopName: settings.shopName,
    logoUrl: settings.logoUrl,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    currency: settings.currency,
    currencySymbol: settings.currencySymbol,
    exchangeRate: settings.exchangeRate,
    taxEnabled: settings.taxEnabled,
    taxRate: settings.taxRate,
    deliveryFee: settings.deliveryFee,
    freeDeliveryThreshold: settings.freeDeliveryThreshold,
    guestCheckout: settings.guestCheckout,
    loyalty: settings.loyalty,
    paymentMethods: settings.paymentMethods.filter((method) => method.enabled),
    social: settings.social,
    businessHours: settings.businessHours,
    homepage: settings.homepage,
    invoice: { showLogo: settings.invoice.showLogo, footer: settings.invoice.footer },
  };
}

export { DEFAULT_PAYMENT_METHODS };
