/**
 * Idempotent demo seed for HILAAL.
 *
 * Safe to run repeatedly: catalogue entries are upserted by slug/sku and
 * transactional demo data (orders, sales, purchases, expenses) is only created
 * when it does not exist yet. All stock and finance movements go through the
 * real services so the ledger and inventory stay consistent.
 *
 *   npm run seed
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { bootstrap } from './bootstrap.js';
import { env } from './config/env.js';
import { Brand, Category, Product, Review } from './models/catalog.js';
import { Branch, Customer, Role, Supplier, User } from './models/people.js';
import { Order, Payment } from './models/sales.js';
import { Expense, NewsletterSubscriber, LedgerEntry } from './models/operations.js';
import { Purchase } from './models/purchasing.js';
import { getSettings } from './services/settings.js';
import {
  findOrCreateCustomer,
  createOrder,
  recordOrderPayment,
  transitionOrder,
  priceItems,
  calculateOrderTotals,
} from './services/orders.js';
import { createSale } from './services/pos.js';
import { createPurchase, receivePurchase } from './services/purchases.js';
import { postLedger, ACCOUNTS } from './services/ledger.js';
import { generateNumber } from './utils/sequence.js';

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

const CATEGORIES = [
  { name: 'Groceries', slug: 'groceries', description: 'Pantry staples for every day.', image: img('photo-1542838132-92c53300491e'), sortOrder: 1 },
  { name: 'Beverages', slug: 'beverages', description: 'Water, juice, coffee and tea.', image: img('photo-1544145945-f90425340c7e'), sortOrder: 2 },
  { name: 'Household', slug: 'household', description: 'Cleaning and everyday home essentials.', image: img('photo-1585421514738-01798e348b17'), sortOrder: 3 },
  { name: 'Personal Care', slug: 'personal-care', description: 'Care for you and your family.', image: img('photo-1556228578-8c89e6adf883'), sortOrder: 4 },
  { name: 'Snacks', slug: 'snacks', description: 'Little treats, big smiles.', image: img('photo-1566478989037-eec170784d0b'), sortOrder: 5 },
  { name: 'Dairy & Eggs', slug: 'dairy-eggs', description: 'Fresh from trusted farms.', image: img('photo-1550583724-b2692b85b150'), sortOrder: 6 },
  { name: 'Bakery', slug: 'bakery', description: 'Baked fresh through the day.', image: img('photo-1509440159596-0249088772ff'), sortOrder: 7 },
  { name: 'Baby & Kids', slug: 'baby-kids', description: 'Gentle essentials for little ones.', image: img('photo-1515488042361-ee00e0ddd4e4'), sortOrder: 8 },
];

const BRANDS = [
  { name: 'Hilaal Select', slug: 'hilaal-select', description: 'Our own carefully chosen range.' },
  { name: 'Al Marwa', slug: 'al-marwa', description: 'Trusted pantry staples.' },
  { name: 'Somali Fresh', slug: 'somali-fresh', description: 'Local farms and producers.' },
  { name: 'NuraCare', slug: 'nuracare', description: 'Personal and home care.' },
  { name: 'Baraka Foods', slug: 'baraka-foods', description: 'Wholesome family food.' },
  { name: 'Sunrise Bakery', slug: 'sunrise-bakery', description: 'Freshly baked daily.' },
];

interface SeedProduct {
  name: string;
  slug: string;
  sku: string;
  category: string;
  brand: string;
  price: number;
  costPrice: number;
  compareAtPrice?: number;
  stock: number;
  minStockLevel?: number;
  unit?: 'piece' | 'box' | 'kg' | 'liter' | 'pack' | 'dozen' | 'meter' | 'other';
  image: string;
  shortDescription: string;
  description: string;
  tags: string[];
  isFeatured?: boolean;
  specs?: { key: string; value: string }[];
  variations?: { label: string; priceDelta: number; isDefault?: boolean }[];
}

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Basmati Rice 5kg', slug: 'basmati-rice-5kg', sku: 'GRC-RICE-5K', category: 'groceries', brand: 'al-marwa',
    price: 12.5, costPrice: 9.2, compareAtPrice: 14, stock: 64, image: img('photo-1586201375761-83865001e31c'),
    shortDescription: 'Long-grain aromatic rice for everyday meals.',
    description: 'Carefully aged long-grain basmati with a light aroma and separate grains. A dependable staple for family meals, celebrations and everything in between.',
    tags: ['rice', 'staple', 'family'], isFeatured: true,
    specs: [{ key: 'Weight', value: '5 kg' }, { key: 'Origin', value: 'Pakistan' }],
    variations: [{ label: '5 kg', priceDelta: 0, isDefault: true }, { label: '10 kg', priceDelta: 10.5 }],
  },
  {
    name: 'Sunflower Cooking Oil 3L', slug: 'sunflower-cooking-oil-3l', sku: 'GRC-OIL-3L', category: 'groceries', brand: 'hilaal-select',
    price: 8.9, costPrice: 6.4, stock: 42, unit: 'liter', image: img('photo-1474979266404-7eaacbcd87c5'),
    shortDescription: 'Light, clean cooking oil for frying and baking.',
    description: 'Refined sunflower oil with a neutral taste that lets your ingredients speak. Suitable for frying, baking and everyday cooking.',
    tags: ['oil', 'cooking', 'kitchen'], isFeatured: true,
    specs: [{ key: 'Volume', value: '3 litres' }],
  },
  {
    name: 'Granulated Sugar 2kg', slug: 'granulated-sugar-2kg', sku: 'GRC-SUGAR-2K', category: 'groceries', brand: 'al-marwa',
    price: 3.4, costPrice: 2.35, stock: 80, image: img('photo-1581441363689-1f3c3c414635'),
    shortDescription: 'Fine white sugar for tea, baking and cooking.',
    description: 'Bright, free-flowing granulated sugar in a resealable bag. A kitchen essential for drinks, desserts and daily cooking.',
    tags: ['sugar', 'baking', 'staple'],
    specs: [{ key: 'Weight', value: '2 kg' }],
  },
  {
    name: 'Spaghetti Pasta 500g', slug: 'spaghetti-pasta-500g', sku: 'GRC-PASTA-500', category: 'groceries', brand: 'baraka-foods',
    price: 1.6, costPrice: 1.05, stock: 120, image: img('photo-1551462147-ff29053bfc14'),
    shortDescription: 'Durum wheat spaghetti with a firm bite.',
    description: 'Made from durum wheat semolina and slow-dried for a consistent texture. Ready in ten minutes and perfect with a simple tomato sauce.',
    tags: ['pasta', 'quick meal'],
    specs: [{ key: 'Weight', value: '500 g' }],
  },
  {
    name: 'Pure Honey 500g', slug: 'pure-honey-500g', sku: 'GRC-HONEY-500', category: 'groceries', brand: 'somali-fresh',
    price: 9.8, costPrice: 7.1, compareAtPrice: 11.5, stock: 26, image: img('photo-1587049352846-4a222e784d38'),
    shortDescription: 'Raw, unfiltered honey with a rich floral finish.',
    description: 'Sourced from small beekeepers and bottled without heating or filtering. Stir into tea, drizzle over yoghurt or enjoy by the spoon.',
    tags: ['honey', 'local', 'gift'], isFeatured: true,
    specs: [{ key: 'Weight', value: '500 g' }, { key: 'Source', value: 'Somalia' }],
  },
  {
    name: 'Mineral Water 1.5L (Pack of 6)', slug: 'mineral-water-1-5l-pack-6', sku: 'BEV-WATER-6PK', category: 'beverages', brand: 'hilaal-select',
    price: 4.2, costPrice: 2.8, stock: 90, unit: 'pack', image: img('photo-1548839140-29a749e1cf4d'),
    shortDescription: 'Naturally filtered drinking water, six bottles.',
    description: 'Clean-tasting mineral water in convenient 1.5 litre bottles. Ideal for the home, office or shop fridge.',
    tags: ['water', 'drinks', 'bulk'],
    specs: [{ key: 'Pack', value: '6 × 1.5 L' }],
  },
  {
    name: 'Orange Juice 1L', slug: 'orange-juice-1l', sku: 'BEV-ORANGE-1L', category: 'beverages', brand: 'somali-fresh',
    price: 2.9, costPrice: 1.95, stock: 48, unit: 'liter', image: img('photo-1600271886742-f049cd451bba'),
    shortDescription: 'Pressed orange juice with no added sugar.',
    description: 'Bright, refreshing orange juice pressed from ripe fruit. Keep chilled and shake before serving.',
    tags: ['juice', 'breakfast', 'no sugar added'],
    specs: [{ key: 'Volume', value: '1 litre' }],
  },
  {
    name: 'Ground Coffee 250g', slug: 'ground-coffee-250g', sku: 'BEV-COFFEE-250', category: 'beverages', brand: 'hilaal-select',
    price: 7.5, costPrice: 5.2, stock: 34, image: img('photo-1447933601403-0c6688de566e'),
    shortDescription: 'Medium-roast ground coffee, ready for your pot.',
    description: 'A balanced medium roast with notes of cocoa and dried fruit. Ground for filter, moka pot or traditional preparation.',
    tags: ['coffee', 'morning', 'gift'], isFeatured: true,
    specs: [{ key: 'Weight', value: '250 g' }, { key: 'Roast', value: 'Medium' }],
  },
  {
    name: 'Black Tea 100 Bags', slug: 'black-tea-100-bags', sku: 'BEV-TEA-100', category: 'beverages', brand: 'al-marwa',
    price: 5.6, costPrice: 3.9, stock: 58, unit: 'box', image: img('photo-1544787219-7f47ccb76574'),
    shortDescription: 'Strong, smooth black tea for the perfect cup.',
    description: 'A robust blend that stands up to milk and sugar. One hundred individually sealed bags keep every cup fresh.',
    tags: ['tea', 'staple', 'family'],
    specs: [{ key: 'Bags', value: '100' }],
  },
  {
    name: 'Dishwashing Liquid 750ml', slug: 'dishwashing-liquid-750ml', sku: 'HHD-DISH-750', category: 'household', brand: 'nuracare',
    price: 3.2, costPrice: 2.05, stock: 70, image: img('photo-1585421514738-01798e348b17'),
    shortDescription: 'Tough on grease, gentle on hands.',
    description: 'Concentrated lemon-scented dishwashing liquid that cuts through grease with a small squeeze. Rinses clean and leaves no residue.',
    tags: ['cleaning', 'kitchen'],
    specs: [{ key: 'Volume', value: '750 ml' }],
  },
  {
    name: 'Laundry Detergent 3kg', slug: 'laundry-detergent-3kg', sku: 'HHD-LAUNDRY-3K', category: 'household', brand: 'nuracare',
    price: 11.9, costPrice: 8.6, compareAtPrice: 13.5, stock: 36, image: img('photo-1610557892470-55d9e80c0bce'),
    shortDescription: 'Fresh-scented powder for everyday washes.',
    description: 'A high-efficiency detergent powder that lifts everyday stains and keeps colours bright. Suitable for hand wash and machines.',
    tags: ['laundry', 'cleaning', 'family'], isFeatured: true,
    specs: [{ key: 'Weight', value: '3 kg' }],
  },
  {
    name: 'Facial Tissue 200 Sheets', slug: 'facial-tissue-200-sheets', sku: 'HHD-TISSUE-200', category: 'household', brand: 'hilaal-select',
    price: 2.4, costPrice: 1.5, stock: 95, unit: 'box', image: img('photo-1584556812952-905ffd0c611a'),
    shortDescription: 'Soft, two-ply tissues for home and office.',
    description: 'Gentle two-ply tissue in a compact box. Strong enough for everyday spills and soft enough for daily use.',
    tags: ['tissue', 'home'],
    specs: [{ key: 'Sheets', value: '200' }],
  },
  {
    name: 'Multi-Surface Cleaner 1L', slug: 'multi-surface-cleaner-1l', sku: 'HHD-CLEAN-1L', category: 'household', brand: 'nuracare',
    price: 4.5, costPrice: 2.9, stock: 44, image: img('photo-1585421514738-01798e348b17'),
    shortDescription: 'One spray for kitchen, bathroom and floors.',
    description: 'A fresh eucalyptus-scented cleaner that lifts everyday dirt from sealed surfaces. No rinsing required.',
    tags: ['cleaning', 'home'],
    specs: [{ key: 'Volume', value: '1 litre' }],
  },
  {
    name: 'Moisturising Soap Bar', slug: 'moisturising-soap-bar', sku: 'PCR-SOAP-100', category: 'personal-care', brand: 'nuracare',
    price: 1.9, costPrice: 1.1, stock: 140, image: img('photo-1584305574647-0cc949a2bb9f'),
    shortDescription: 'Creamy, lightly scented daily soap.',
    description: 'A gentle soap with glycerin and shea butter that cleans without leaving skin tight. Suitable for the whole family.',
    tags: ['soap', 'bath', 'family'],
    specs: [{ key: 'Weight', value: '100 g' }],
  },
  {
    name: 'Herbal Shampoo 400ml', slug: 'herbal-shampoo-400ml', sku: 'PCR-SHAMPOO-400', category: 'personal-care', brand: 'nuracare',
    price: 6.8, costPrice: 4.4, stock: 52, image: img('photo-1571781926291-c477ebfd024b'),
    shortDescription: 'Sulphate-free shampoo for soft, healthy hair.',
    description: 'A mild herbal formula with aloe and rosemary that cleanses the scalp without stripping natural oils.',
    tags: ['hair', 'care'],
    specs: [{ key: 'Volume', value: '400 ml' }],
  },
  {
    name: 'Fluoride Toothpaste 100ml', slug: 'fluoride-toothpaste-100ml', sku: 'PCR-TOOTH-100', category: 'personal-care', brand: 'nuracare',
    price: 2.8, costPrice: 1.75, stock: 88, image: img('photo-1559598467-f8b76c8155d0'),
    shortDescription: 'Fresh mint protection for daily brushing.',
    description: 'A smooth mint gel with fluoride for cavity protection and fresh breath. Gentle enough for twice-daily use.',
    tags: ['dental', 'care'],
    specs: [{ key: 'Volume', value: '100 ml' }],
  },
  {
    name: 'Dark Chocolate 70% 100g', slug: 'dark-chocolate-70-100g', sku: 'SNK-CHOC-100', category: 'snacks', brand: 'baraka-foods',
    price: 3.6, costPrice: 2.2, stock: 60, image: img('photo-1575377427642-087cf684f29d'),
    shortDescription: 'Rich 70% cocoa chocolate, ethically sourced.',
    description: 'Deep, bittersweet chocolate with a clean snap and a long cocoa finish. A small square is enough.',
    tags: ['chocolate', 'treat', 'gift'], isFeatured: true,
    specs: [{ key: 'Weight', value: '100 g' }, { key: 'Cocoa', value: '70%' }],
  },
  {
    name: 'Sea Salt Potato Chips 150g', slug: 'sea-salt-potato-chips-150g', sku: 'SNK-CHIPS-150', category: 'snacks', brand: 'baraka-foods',
    price: 2.2, costPrice: 1.3, stock: 75, image: img('photo-1566478989037-eec170784d0b'),
    shortDescription: 'Crispy chips with a light sea-salt finish.',
    description: 'Thick-cut potatoes fried until golden and seasoned with sea salt. Made for sharing, though we will not judge.',
    tags: ['chips', 'snack'],
    specs: [{ key: 'Weight', value: '150 g' }],
  },
  {
    name: 'Mixed Nuts 300g', slug: 'mixed-nuts-300g', sku: 'SNK-NUTS-300', category: 'snacks', brand: 'hilaal-select',
    price: 7.9, costPrice: 5.5, stock: 32, image: img('photo-1599599810769-bcde5a160d32'),
    shortDescription: 'Roasted almonds, cashews and peanuts.',
    description: 'A generous mix of roasted nuts with no added salt. Keep a handful nearby for an honest afternoon snack.',
    tags: ['nuts', 'healthy', 'snack'],
    specs: [{ key: 'Weight', value: '300 g' }],
  },
  {
    name: 'Fresh Milk 1L', slug: 'fresh-milk-1l', sku: 'DRY-MILK-1L', category: 'dairy-eggs', brand: 'somali-fresh',
    price: 2.1, costPrice: 1.4, stock: 40, unit: 'liter', image: img('photo-1550583724-b2692b85b150'),
    shortDescription: 'Fresh full-cream milk, chilled daily.',
    description: 'Smooth full-cream milk from local farms, pasteurised and bottled fresh. Keep refrigerated.',
    tags: ['milk', 'fresh', 'breakfast'],
    specs: [{ key: 'Volume', value: '1 litre' }],
  },
  {
    name: 'Free-Range Eggs (12)', slug: 'free-range-eggs-12', sku: 'DRY-EGGS-12', category: 'dairy-eggs', brand: 'somali-fresh',
    price: 3.9, costPrice: 2.6, stock: 55, unit: 'dozen', image: img('photo-1582722872445-44dc5f7e3c8f'),
    shortDescription: 'A dozen large free-range eggs.',
    description: 'Collected daily from free-range hens and packed in a protective tray. Rich yolks, firm whites.',
    tags: ['eggs', 'fresh', 'protein'], isFeatured: true,
    specs: [{ key: 'Quantity', value: '12 eggs' }],
  },
  {
    name: 'Greek Yoghurt 500g', slug: 'greek-yoghurt-500g', sku: 'DRY-YOG-500', category: 'dairy-eggs', brand: 'somali-fresh',
    price: 4.3, costPrice: 2.8, stock: 30, image: img('photo-1488477181946-6428a0291777'),
    shortDescription: 'Thick, creamy yoghurt with live cultures.',
    description: 'Strained for a dense, creamy texture and a pleasant tang. Enjoy with honey and fruit or use in savoury dishes.',
    tags: ['yoghurt', 'fresh', 'breakfast'],
    specs: [{ key: 'Weight', value: '500 g' }],
  },
  {
    name: 'Sourdough Loaf', slug: 'sourdough-loaf', sku: 'BAK-SOUR-700', category: 'bakery', brand: 'sunrise-bakery',
    price: 4.8, costPrice: 2.9, stock: 18, image: img('photo-1509440159596-0249088772ff'),
    shortDescription: 'Slow-fermented loaf with a crisp crust.',
    description: 'Baked fresh this morning from flour, water and salt. A crackling crust and an open, tangy crumb.',
    tags: ['bread', 'fresh', 'bakery'], isFeatured: true,
    specs: [{ key: 'Weight', value: '700 g' }],
  },
  {
    name: 'Butter Croissants (4)', slug: 'butter-croissants-4', sku: 'BAK-CROIS-4', category: 'bakery', brand: 'sunrise-bakery',
    price: 5.2, costPrice: 3.1, stock: 22, unit: 'pack', image: img('photo-1555507036-ab1f4038808a'),
    shortDescription: 'Flaky, all-butter croissants baked daily.',
    description: 'Laminated with real butter and baked until deeply golden. Warm briefly before serving.',
    tags: ['pastry', 'breakfast', 'bakery'],
    specs: [{ key: 'Pack', value: '4 pieces' }],
  },
  {
    name: 'Baby Wipes 72 Sheets', slug: 'baby-wipes-72-sheets', sku: 'BBY-WIPES-72', category: 'baby-kids', brand: 'nuracare',
    price: 3.5, costPrice: 2.1, stock: 64, unit: 'pack', image: img('photo-1515488042361-ee00e0ddd4e4'),
    shortDescription: 'Fragrance-free wipes for sensitive skin.',
    description: 'Soft, thick wipes with 99% water and no added fragrance. Resealable pack keeps every wipe moist.',
    tags: ['baby', 'care'],
    specs: [{ key: 'Sheets', value: '72' }],
  },
  {
    name: 'Baby Rice Cereal 250g', slug: 'baby-rice-cereal-250g', sku: 'BBY-CEREAL-250', category: 'baby-kids', brand: 'baraka-foods',
    price: 4.1, costPrice: 2.6, stock: 28, image: img('photo-1515488042361-ee00e0ddd4e4'),
    shortDescription: 'Gentle first food fortified with iron.',
    description: 'Finely milled rice cereal for babies from six months. Mix with milk or water to a smooth consistency.',
    tags: ['baby', 'food'],
    specs: [{ key: 'Weight', value: '250 g' }, { key: 'Age', value: '6+ months' }],
  },
];

const CUSTOMERS = [
  { name: 'Amina Yusuf', phone: '+252 61 555 0101', email: 'amina@example.com', address: 'Hodan District, Street 4', city: 'Mogadishu', account: true },
  { name: 'Mohamed Ali', phone: '+252 61 555 0102', email: 'mohamed@example.com', address: 'Wadajir District, House 22', city: 'Mogadishu', account: true },
  { name: 'Sahra Abdi', phone: '+252 63 555 0103', email: 'sahra@example.com', address: 'Hamar Weyne, near the market', city: 'Mogadishu', account: false },
  { name: 'Abdirahman Hassan', phone: '+252 65 555 0104', email: 'abdirahman@example.com', address: 'Karaan District, Villa 7', city: 'Mogadishu', account: false },
  { name: 'Fatima Noor', phone: '+252 62 555 0105', email: 'fatima@example.com', address: 'Yaqshid District, Street 12', city: 'Mogadishu', account: false },
];

const SUPPLIERS = [
  { name: 'Baraka Wholesale', company: 'Baraka Trading Co.', phone: '+252 61 777 2001', email: 'orders@barakawholesale.so', address: 'Bakara Market, Mogadishu', productsSupplied: ['Rice', 'Sugar', 'Pasta', 'Cooking oil'] },
  { name: 'Somali Fresh Farms', company: 'Somali Fresh Ltd.', phone: '+252 63 777 2002', email: 'supply@somalifresh.so', address: 'Afgooye Road, Mogadishu', productsSupplied: ['Milk', 'Eggs', 'Yoghurt', 'Juice'] },
  { name: 'NuraCare Distribution', company: 'NuraCare', phone: '+252 65 777 2003', email: 'trade@nuracare.so', address: 'Hodan District, Mogadishu', productsSupplied: ['Soap', 'Shampoo', 'Detergent', 'Cleaning'] },
];

async function seedStaff() {
  const staff = [
    { name: 'Ayaan Warsame', email: 'manager@hilaal.shop', role: 'shop_manager', phone: '+252 61 444 1001' },
    { name: 'Ismail Farah', email: 'cashier@hilaal.shop', role: 'cashier', phone: '+252 61 444 1002' },
    { name: 'Hodan Jama', email: 'finance@hilaal.shop', role: 'finance_manager', phone: '+252 61 444 1003' },
    { name: 'Yusuf Omar', email: 'inventory@hilaal.shop', role: 'inventory_manager', phone: '+252 61 444 1004' },
  ];
  for (const entry of staff) {
    const existing = await User.findOne({ email: entry.email });
    if (existing) continue;
    const role = await Role.findOne({ slug: entry.role });
    await User.create({
      name: entry.name,
      email: entry.email,
      phone: entry.phone,
      passwordHash: 'Hilaal@2026',
      kind: 'staff',
      role: role?._id,
      status: 'active',
    });
    console.log(`  + staff ${entry.email} (${entry.role})`);
  }
}

async function main() {
  await connectDatabase();
  await bootstrap();
  console.log('Seeding demo data…');

  const settings = await getSettings();
  const branch = await Branch.findOne({ code: 'MAIN' });
  const admin = await User.findOne({ email: env.SEED_ADMIN_EMAIL });
  if (!admin) throw new Error('Super admin missing — bootstrap failed');
  const actor = { id: String(admin._id), name: admin.name };

  /* Opening capital so the demo shop has a sensible cash position. */
  if ((await LedgerEntry.countDocuments({ account: ACCOUNTS.OWNER_EQUITY })) === 0) {
    await postLedger(
      [
        { account: ACCOUNTS.CASH, debit: 2500, description: 'Opening cash float' },
        { account: ACCOUNTS.OWNER_EQUITY, credit: 2500, description: 'Owner opening capital' },
      ],
      {
        refType: 'opening',
        refNumber: 'OPEN-0001',
        currency: settings.currency,
        createdBy: admin._id,
      }
    );
    console.log('  ✓ opening cash float posted');
  }

  /* Categories & brands */
  const categoryIds = new Map<string, mongoose.Types.ObjectId>();
  for (const category of CATEGORIES) {
    const doc = await Category.findOneAndUpdate(
      { slug: category.slug },
      { $set: { ...category, isActive: true } },
      { upsert: true, new: true }
    );
    categoryIds.set(category.slug, doc._id);
  }
  const brandIds = new Map<string, mongoose.Types.ObjectId>();
  for (const brand of BRANDS) {
    const doc = await Brand.findOneAndUpdate(
      { slug: brand.slug },
      { $set: { ...brand, isActive: true } },
      { upsert: true, new: true }
    );
    brandIds.set(brand.slug, doc._id);
  }
  console.log(`  ✓ ${CATEGORIES.length} categories, ${BRANDS.length} brands`);

  /* Products */
  const productIds = new Map<string, mongoose.Types.ObjectId>();
  for (const entry of PRODUCTS) {
    const doc = await Product.findOneAndUpdate(
      { slug: entry.slug },
      {
        $set: {
          name: entry.name,
          sku: entry.sku,
          category: categoryIds.get(entry.category),
          brand: brandIds.get(entry.brand),
          description: entry.description,
          shortDescription: entry.shortDescription,
          unit: entry.unit ?? 'piece',
          costPrice: entry.costPrice,
          price: entry.price,
          compareAtPrice: entry.compareAtPrice,
          minStockLevel: entry.minStockLevel ?? 10,
          images: [entry.image],
          specs: entry.specs ?? [],
          variations: (entry.variations ?? []).map((variation) => ({
            label: variation.label,
            priceDelta: variation.priceDelta,
            isDefault: Boolean(variation.isDefault),
          })),
          tags: entry.tags,
          status: 'active',
          isFeatured: Boolean(entry.isFeatured),
          branch: branch?._id,
        },
        $setOnInsert: { stock: entry.stock },
      },
      { upsert: true, new: true }
    );
    productIds.set(entry.slug, doc._id);
  }
  console.log(`  ✓ ${PRODUCTS.length} products`);

  /* Staff & customer accounts */
  await seedStaff();
  const customerDocs = [];
  for (const entry of CUSTOMERS) {
    let userId: mongoose.Types.ObjectId | undefined;
    if (entry.account) {
      let user = await User.findOne({ email: entry.email });
      if (!user) {
        user = await User.create({
          name: entry.name,
          email: entry.email,
          phone: entry.phone,
          passwordHash: 'Customer@2026',
          kind: 'customer',
          status: 'active',
        });
      }
      userId = user._id;
    }
    const customer = await findOrCreateCustomer({
      name: entry.name,
      phone: entry.phone,
      email: entry.email,
      address: entry.address,
      city: entry.city,
      userId,
      branchId: branch?._id,
    });
    if (userId && !customer.user) {
      customer.user = userId;
      await customer.save();
    }
    customerDocs.push(customer);
  }
  console.log(`  ✓ ${customerDocs.length} customers (2 with online accounts)`);

  /* Suppliers */
  const supplierDocs = [];
  for (let index = 0; index < SUPPLIERS.length; index += 1) {
    const entry = SUPPLIERS[index];
    const supplierNumber = `SUP-${String(index + 1).padStart(4, '0')}`;
    const doc = await Supplier.findOneAndUpdate(
      { supplierNumber },
      { $set: { ...entry, status: 'active' } },
      { upsert: true, new: true }
    );
    supplierDocs.push(doc);
  }
  console.log(`  ✓ ${supplierDocs.length} suppliers`);

  /* Reviews */
  if ((await Review.countDocuments()) === 0) {
    const reviews = [
      { product: 'basmati-rice-5kg', name: 'Amina Y.', rating: 5, title: 'Perfect every time', comment: 'The grains stay separate and it cooks beautifully. This is now the only rice I buy.' },
      { product: 'basmati-rice-5kg', name: 'Mohamed A.', rating: 4, title: 'Great value', comment: 'Good quality rice at a fair price. Delivery was quick.' },
      { product: 'pure-honey-500g', name: 'Sahra A.', rating: 5, title: 'Real honey', comment: 'Rich flavour and not overly sweet. You can tell it is the real thing.' },
      { product: 'ground-coffee-250g', name: 'Abdirahman H.', rating: 5, title: 'Lovely roast', comment: 'Smooth and not bitter. Makes a great cup in the moka pot.' },
      { product: 'sourdough-loaf', name: 'Fatima N.', rating: 4, title: 'Fresh and crusty', comment: 'Arrived the same morning and tasted wonderful with butter.' },
      { product: 'free-range-eggs-12', name: 'Amina Y.', rating: 5, title: 'Very fresh', comment: 'Strong shells and bright yolks. Will order again.' },
    ];
    for (const entry of reviews) {
      const product = await Product.findOne({ slug: entry.product });
      if (!product) continue;
      await Review.create({
        product: product._id,
        customer: customerDocs[0]._id,
        authorName: entry.name,
        rating: entry.rating,
        title: entry.title,
        comment: entry.comment,
        status: 'approved',
      });
    }
    for (const product of await Product.find()) {
      const productReviews = await Review.find({ product: product._id, status: 'approved' });
      if (!productReviews.length) continue;
      const rating = productReviews.reduce((sum, review) => sum + review.rating, 0) / productReviews.length;
      product.rating = Math.round(rating * 10) / 10;
      product.reviewCount = productReviews.length;
      await product.save();
    }
    console.log('  ✓ 6 approved reviews');
  }

  /* Purchase from a supplier (received, creates a payable) */
  if ((await Purchase.countDocuments()) === 0) {
    const purchase = await createPurchase(
      {
        supplierId: String(supplierDocs[0]._id),
        items: [
          { productId: String(productIds.get('basmati-rice-5kg')), quantity: 20, unitCost: 9.2 },
          { productId: String(productIds.get('granulated-sugar-2kg')), quantity: 30, unitCost: 2.35 },
        ],
        status: 'ordered',
        notes: 'Weekly pantry restock',
      },
      actor
    );
    await receivePurchase(String(purchase._id), actor);
    console.log(`  ✓ purchase ${purchase.purchaseNumber} received`);
  }

  /* Expenses */
  if ((await Expense.countDocuments()) === 0) {
    const entries = [
      { category: 'rent', description: 'Shop rent — current month', amount: 450, daysAgo: 5, method: 'cash_at_shop', paidTo: 'Property owner' },
      { category: 'electricity', description: 'Electricity bill', amount: 85.5, daysAgo: 4, method: 'cash_at_shop', paidTo: 'Beco' },
      { category: 'transport', description: 'Delivery fuel and transport', amount: 60, daysAgo: 2, method: 'cash_at_shop', paidTo: 'Fuel station' },
      { category: 'marketing', description: 'Local flyers and signage', amount: 40, daysAgo: 1, method: 'cash_at_shop', paidTo: 'Print shop' },
    ];
    for (const entry of entries) {
      const expenseNumber = await generateNumber('expense', 'EXP');
      const date = new Date(Date.now() - entry.daysAgo * 86_400_000);
      const expense = await Expense.create({
        expenseNumber,
        category: entry.category,
        description: entry.description,
        amount: entry.amount,
        date,
        paymentMethod: entry.method,
        paidTo: entry.paidTo,
        status: 'paid',
        createdBy: admin._id,
        createdByName: admin.name,
      });
      await postLedger(
        [
          { account: `${ACCOUNTS.EXPENSE}:${expense.category}`, debit: expense.amount, description: expense.description },
          { account: ACCOUNTS.CASH, credit: expense.amount },
        ],
        {
          date: expense.date,
          refType: 'expense',
          refId: expense._id,
          refNumber: expense.expenseNumber,
          currency: settings.currency,
          createdBy: admin._id,
        }
      );
    }
    console.log('  ✓ 4 paid expenses posted to the ledger');
  }

  /* POS sales */
  if ((await Payment.countDocuments({ kind: 'sale' })) === 0) {
    const baskets = [
      { items: [{ productId: String(productIds.get('fresh-milk-1l')), quantity: 2 }, { productId: String(productIds.get('sourdough-loaf')), quantity: 1 }], method: 'cash_at_shop' },
      { items: [{ productId: String(productIds.get('basmati-rice-5kg')), quantity: 1 }, { productId: String(productIds.get('sunflower-cooking-oil-3l')), quantity: 1 }], method: 'evc_plus' },
      { items: [{ productId: String(productIds.get('baby-wipes-72-sheets')), quantity: 2 }, { productId: String(productIds.get('moisturising-soap-bar')), quantity: 3 }], method: 'cash_at_shop', customer: customerDocs[0]._id },
    ];
    for (const basket of baskets) {
      const { lines } = await priceItems(basket.items);
      const totals = await calculateOrderTotals(lines, 0);
      await createSale(
        {
          items: basket.items,
          payments: [
            {
              method: basket.method,
              amount: totals.total,
              reference: basket.method === 'evc_plus' ? 'EVC-DEMO-1001' : undefined,
            },
          ],
          customerId: basket.customer ? String(basket.customer) : undefined,
        },
        { ...actor, canDiscount: true }
      );
    }
    console.log(`  ✓ ${baskets.length} POS sales posted`);
  }

  /* Orders */
  if ((await Order.countDocuments()) === 0) {
    const orderSpecs = [
      {
        customer: customerDocs[0],
        items: [{ productId: String(productIds.get('free-range-eggs-12')), quantity: 1 }, { productId: String(productIds.get('fresh-milk-1l')), quantity: 2 }],
        method: 'cash_on_delivery',
        flow: ['confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered'] as const,
        pay: true,
      },
      {
        customer: customerDocs[1],
        items: [{ productId: String(productIds.get('laundry-detergent-3kg')), quantity: 1 }, { productId: String(productIds.get('facial-tissue-200-sheets')), quantity: 2 }],
        method: 'evc_plus',
        flow: ['confirmed', 'processing'] as const,
        pay: false,
      },
      {
        customer: customerDocs[2],
        items: [{ productId: String(productIds.get('dark-chocolate-70-100g')), quantity: 2 }, { productId: String(productIds.get('mixed-nuts-300g')), quantity: 1 }],
        method: 'zaad',
        flow: ['confirmed'] as const,
        pay: false,
      },
    ];
    for (const spec of orderSpecs) {
      const order = await createOrder({
        items: spec.items,
        shippingAddress: {
          fullName: spec.customer.name,
          phone: spec.customer.phone,
          address: spec.customer.address ?? 'Mogadishu',
          city: spec.customer.city ?? 'Mogadishu',
        },
        paymentMethod: spec.method,
        customerId: String(spec.customer._id),
      });
      if (spec.pay) {
        await recordOrderPayment(
          String(order._id),
          { amount: order.total, method: spec.method },
          actor
        );
      }
      for (const status of spec.flow) {
        await transitionOrder(String(order._id), status, actor, `Demo seed → ${status}`);
      }
    }
    console.log(`  ✓ ${orderSpecs.length} online orders (one delivered, one processing, one confirmed)`);
  }

  /* Newsletter */
  if ((await NewsletterSubscriber.countDocuments()) === 0) {
    await NewsletterSubscriber.create({ email: 'hello@example.com', source: 'seed' });
  }

  console.log('\n✓ Seed complete');
  console.log(`  Admin:    ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}`);
  console.log('  Manager:  manager@hilaal.shop / Hilaal@2026');
  console.log('  Cashier:  cashier@hilaal.shop / Hilaal@2026');
  console.log('  Customer: amina@example.com / Customer@2026');
  await disconnectDatabase();
}

main().catch(async (error) => {
  console.error('✖ Seed failed', error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
