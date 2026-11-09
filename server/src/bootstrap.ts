import { ALL_PERMISSIONS, PERMISSION_GROUPS, SYSTEM_ROLES } from './config/permissions.js';
import { Branch, Permission, Role, User } from './models/people.js';
import { ContentPage } from './models/operations.js';
import { getSettings } from './services/settings.js';
import { env } from './config/env.js';

const CONTENT_PAGES = [
  {
    slug: 'about',
    title: 'A general shop, thoughtfully run.',
    subtitle: 'HILAAL brings everyday essentials and considered service together under one roof.',
    body: 'HILAAL began with a simple observation: buying everyday essentials should feel effortless, honest and a little bit special. We curate groceries, household goods, personal care and seasonal finds from suppliers we trust, then price them fairly and deliver them with care.\n\nOur team runs a physical shop in Mogadishu and this online store from the same inventory, so what you see is what we actually have. Every order, sale and stock movement is recorded in one system — which means fewer mistakes, fresher products and better service for you.',
    sections: [
      {
        heading: 'What we stand for',
        body: 'Fair prices, real availability and respect for your time. We would rather tell you an item is out of stock than take your money and make you wait.',
      },
      {
        heading: 'Where we are going',
        body: 'HILAAL is built to grow into new neighbourhoods and branches without losing the personal service that makes a local shop worth visiting.',
      },
    ],
  },
  {
    slug: 'contact',
    title: 'Talk to us.',
    subtitle: 'Questions about an order, a product or a partnership? We are here.',
    body: 'Send us a message using the form and our team will reply during business hours. For urgent order questions, please call the shop directly.',
    sections: [],
  },
  {
    slug: 'faq',
    title: 'Frequently asked questions.',
    subtitle: 'Straight answers about ordering, delivery, payments and returns.',
    body: '',
    sections: [
      {
        heading: 'How do I place an order?',
        body: 'Browse the shop, add items to your cart and continue to checkout. You can order as a guest or create an account to track your orders and collect loyalty points.',
      },
      {
        heading: 'Which payment methods do you accept?',
        body: 'We accept cash on delivery, cash at the shop, and mobile money (EVC Plus, ZAAD, Sahal and eDahab). Mobile money payments are verified manually by our team — you will see the status on your order.',
      },
      {
        heading: 'How long does delivery take?',
        body: 'Local deliveries are usually completed within the same day or the next business day. Our team will call to confirm your address and timing.',
      },
      {
        heading: 'Can I return an item?',
        body: 'Yes. Unopened, non-perishable items can be returned within 7 days of delivery. Perishable goods and personal care items can only be returned if they arrived damaged or incorrect. Start a return from your account or contact us.',
      },
      {
        heading: 'Do you offer loyalty points?',
        body: 'Yes. When loyalty is enabled, you earn points on every completed purchase and can redeem them at checkout or in the shop. Points are shown in your account.',
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Privacy policy.',
    subtitle: 'What we collect, why we collect it, and how we protect it.',
    body: 'We collect the information needed to run the shop and fulfil your orders: your name, phone number, delivery address, email and order history. Staff accounts also have authentication and audit information.\n\nWe do not sell your personal data. Access to customer information is restricted to authorised staff and is recorded in our audit log. Payment references you provide are used only to verify your payment. We retain order records for accounting and legal purposes.',
    sections: [
      {
        heading: 'Your choices',
        body: 'You can update your profile and addresses from your account. To request deletion of your account, contact us. Records tied to completed sales may be retained where required for accounting.',
      },
      {
        heading: 'Cookies',
        body: 'We use a secure, HTTP-only cookie for authentication and local storage for your cart and theme preference. We do not use advertising trackers.',
      },
    ],
  },
  {
    slug: 'terms',
    title: 'Terms and conditions.',
    subtitle: 'The rules that apply when you shop with HILAAL.',
    body: 'By placing an order you confirm that the information you provide is accurate and that you are able to pay for the goods. Prices and availability are confirmed at checkout and may change without notice.\n\nWe reserve the right to cancel an order if stock is unavailable, payment cannot be verified, or we suspect fraud. Where payment has already been received, a refund will be recorded against the original order.',
    sections: [
      {
        heading: 'Accounts',
        body: 'You are responsible for keeping your password secure. Staff accounts are provisioned by the shop and access is limited by role.',
      },
      {
        heading: 'Liability',
        body: 'Nothing in these terms limits rights you have under applicable consumer protection law.',
      },
    ],
  },
  {
    slug: 'returns',
    title: 'Returns and refunds.',
    subtitle: 'If something is not right, we will make it right.',
    body: 'You may request a return within 7 days of delivery for unopened, non-perishable items in their original condition. Damaged or incorrect items should be reported within 48 hours with a photo where possible.\n\nApproved returns are inspected and restocked where appropriate. Refunds are recorded against the original order and paid using the original payment method or cash at the shop. Perishable goods cannot be returned unless they were damaged or incorrect on arrival.',
    sections: [
      {
        heading: 'How to start a return',
        body: 'Contact us with your order number and the items you would like to return, or ask our team in the shop. Once approved, we will arrange collection or ask you to bring the item in.',
      },
    ],
  },
];

/**
 * Idempotent system bootstrap. Safe to run on every boot:
 * syncs permission definitions, default roles, settings, content and the
 * default branch. Creates the first Super Admin only when no staff exist.
 */
export async function bootstrap(): Promise<void> {
  await Permission.bulkWrite(
    PERMISSION_GROUPS.flatMap((group) =>
      group.permissions.map((permission) => ({
        updateOne: {
          filter: { key: permission.key },
          update: {
            $set: { key: permission.key, label: permission.label, group: group.group },
          },
          upsert: true,
        },
      }))
    )
  );

  for (const [slug, definition] of Object.entries(SYSTEM_ROLES)) {
    await Role.findOneAndUpdate(
      { slug },
      {
        $setOnInsert: {
          slug,
          name: definition.name,
          description: definition.description,
          permissions: definition.permissions,
          isSystem: true,
          isActive: true,
        },
      },
      { upsert: true }
    );
  }

  // Keep super admin role aligned with the full permission list on upgrades.
  await Role.updateOne({ slug: 'super_admin' }, { $set: { permissions: ALL_PERMISSIONS } });

  await Branch.findOneAndUpdate(
    { code: 'MAIN' },
    {
      $setOnInsert: {
        name: 'HILAAL Main Shop',
        code: 'MAIN',
        address: 'Makka Al-Mukarama Road, Mogadishu',
        isDefault: true,
        isActive: true,
      },
    },
    { upsert: true }
  );

  await getSettings();

  for (const page of CONTENT_PAGES) {
    await ContentPage.findOneAndUpdate(
      { slug: page.slug },
      { $setOnInsert: { ...page, isPublished: true } },
      { upsert: true }
    );
  }

  const staffCount = await User.countDocuments({ kind: 'staff' });
  if (staffCount === 0) {
    const superAdmin = await Role.findOne({ slug: 'super_admin' });
    if (superAdmin) {
      await User.create({
        name: 'HILAAL Administrator',
        email: env.SEED_ADMIN_EMAIL,
        passwordHash: env.SEED_ADMIN_PASSWORD,
        kind: 'staff',
        role: superAdmin._id,
        status: 'active',
      });
      console.log(`✓ Bootstrapped first Super Admin: ${env.SEED_ADMIN_EMAIL}`);
      console.log('  Change this password after your first sign-in.');
    }
  }
}
