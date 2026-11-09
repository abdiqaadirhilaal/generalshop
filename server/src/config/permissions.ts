export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',
  PRODUCTS_VIEW: 'products:view',
  PRODUCTS_WRITE: 'products:write',
  PRODUCTS_DELETE: 'products:delete',
  CATEGORIES_WRITE: 'categories:write',
  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_WRITE: 'inventory:write',
  POS_USE: 'pos:use',
  POS_DISCOUNT: 'pos:discount',
  ORDERS_VIEW: 'orders:view',
  ORDERS_WRITE: 'orders:write',
  CUSTOMERS_VIEW: 'customers:view',
  CUSTOMERS_WRITE: 'customers:write',
  SUPPLIERS_VIEW: 'suppliers:view',
  SUPPLIERS_WRITE: 'suppliers:write',
  PURCHASES_VIEW: 'purchases:view',
  PURCHASES_WRITE: 'purchases:write',
  FINANCE_VIEW: 'finance:view',
  FINANCE_WRITE: 'finance:write',
  RETURNS_VIEW: 'returns:view',
  RETURNS_WRITE: 'returns:write',
  EMPLOYEES_VIEW: 'employees:view',
  EMPLOYEES_WRITE: 'employees:write',
  REPORTS_VIEW: 'reports:view',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_WRITE: 'settings:write',
  CONTENT_WRITE: 'content:write',
  AUDIT_VIEW: 'audit:view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const PERMISSION_GROUPS: Array<{
  group: string;
  permissions: Array<{ key: PermissionKey; label: string }>;
}> = [
  {
    group: 'Overview',
    permissions: [{ key: PERMISSIONS.DASHBOARD_VIEW, label: 'View dashboard' }],
  },
  {
    group: 'Catalog',
    permissions: [
      { key: PERMISSIONS.PRODUCTS_VIEW, label: 'View products' },
      { key: PERMISSIONS.PRODUCTS_WRITE, label: 'Create & edit products' },
      { key: PERMISSIONS.PRODUCTS_DELETE, label: 'Delete products' },
      { key: PERMISSIONS.CATEGORIES_WRITE, label: 'Manage categories & brands' },
    ],
  },
  {
    group: 'Inventory',
    permissions: [
      { key: PERMISSIONS.INVENTORY_VIEW, label: 'View inventory' },
      { key: PERMISSIONS.INVENTORY_WRITE, label: 'Adjust stock' },
    ],
  },
  {
    group: 'Sales',
    permissions: [
      { key: PERMISSIONS.POS_USE, label: 'Use point of sale' },
      { key: PERMISSIONS.POS_DISCOUNT, label: 'Apply POS discounts' },
      { key: PERMISSIONS.ORDERS_VIEW, label: 'View orders' },
      { key: PERMISSIONS.ORDERS_WRITE, label: 'Manage orders' },
    ],
  },
  {
    group: 'People',
    permissions: [
      { key: PERMISSIONS.CUSTOMERS_VIEW, label: 'View customers' },
      { key: PERMISSIONS.CUSTOMERS_WRITE, label: 'Manage customers' },
      { key: PERMISSIONS.SUPPLIERS_VIEW, label: 'View suppliers' },
      { key: PERMISSIONS.SUPPLIERS_WRITE, label: 'Manage suppliers' },
      { key: PERMISSIONS.EMPLOYEES_VIEW, label: 'View employees' },
      { key: PERMISSIONS.EMPLOYEES_WRITE, label: 'Manage employees & roles' },
    ],
  },
  {
    group: 'Purchasing',
    permissions: [
      { key: PERMISSIONS.PURCHASES_VIEW, label: 'View purchases' },
      { key: PERMISSIONS.PURCHASES_WRITE, label: 'Manage purchases' },
    ],
  },
  {
    group: 'Finance',
    permissions: [
      { key: PERMISSIONS.FINANCE_VIEW, label: 'View finance' },
      { key: PERMISSIONS.FINANCE_WRITE, label: 'Record financial changes' },
      { key: PERMISSIONS.RETURNS_VIEW, label: 'View returns' },
      { key: PERMISSIONS.RETURNS_WRITE, label: 'Process returns & refunds' },
    ],
  },
  {
    group: 'System',
    permissions: [
      { key: PERMISSIONS.REPORTS_VIEW, label: 'View reports & export' },
      { key: PERMISSIONS.SETTINGS_VIEW, label: 'View settings' },
      { key: PERMISSIONS.SETTINGS_WRITE, label: 'Change settings' },
      { key: PERMISSIONS.CONTENT_WRITE, label: 'Edit website content' },
      { key: PERMISSIONS.AUDIT_VIEW, label: 'View audit logs' },
    ],
  },
];

export const SYSTEM_ROLES: Record<
  string,
  { name: string; description: string; permissions: PermissionKey[] }
> = {
  super_admin: {
    name: 'Super Admin',
    description: 'Unrestricted access to every module and setting.',
    permissions: ALL_PERMISSIONS,
  },
  shop_manager: {
    name: 'Shop Manager',
    description: 'Runs day-to-day operations across sales, stock and staff.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCTS_WRITE,
      PERMISSIONS.CATEGORIES_WRITE,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_WRITE,
      PERMISSIONS.POS_USE,
      PERMISSIONS.POS_DISCOUNT,
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.ORDERS_WRITE,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_WRITE,
      PERMISSIONS.SUPPLIERS_VIEW,
      PERMISSIONS.SUPPLIERS_WRITE,
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.PURCHASES_WRITE,
      PERMISSIONS.RETURNS_VIEW,
      PERMISSIONS.RETURNS_WRITE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.EMPLOYEES_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.SETTINGS_VIEW,
    ],
  },
  cashier: {
    name: 'Cashier',
    description: 'Operates the point of sale and handles customer sales.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.POS_USE,
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_WRITE,
    ],
  },
  inventory_manager: {
    name: 'Inventory Manager',
    description: 'Owns products, stock accuracy and purchasing.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.PRODUCTS_WRITE,
      PERMISSIONS.CATEGORIES_WRITE,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_WRITE,
      PERMISSIONS.SUPPLIERS_VIEW,
      PERMISSIONS.SUPPLIERS_WRITE,
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.PURCHASES_WRITE,
      PERMISSIONS.REPORTS_VIEW,
    ],
  },
  finance_manager: {
    name: 'Finance Manager',
    description: 'Handles money, expenses, refunds and financial reporting.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.FINANCE_WRITE,
      PERMISSIONS.REPORTS_VIEW,
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.RETURNS_VIEW,
      PERMISSIONS.RETURNS_WRITE,
      PERMISSIONS.PURCHASES_VIEW,
      PERMISSIONS.AUDIT_VIEW,
    ],
  },
  sales_employee: {
    name: 'Sales Employee',
    description: 'Assists customers, handles orders and customer records.',
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.PRODUCTS_VIEW,
      PERMISSIONS.ORDERS_VIEW,
      PERMISSIONS.ORDERS_WRITE,
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_WRITE,
    ],
  },
};
