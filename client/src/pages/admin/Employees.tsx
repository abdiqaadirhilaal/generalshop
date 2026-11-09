import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth, useToast } from '@/context/AppProviders';
import { AdminPageHeader } from '@/components/AdminLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  StatCard,
  TableSkeleton,
  Tabs,
  Textarea,
} from '@/components/ui';
import { formatDate, initials, statusTone } from '@/lib/format';
import type { Role, User } from '@/types';

interface PermissionGroup {
  group: string;
  permissions: { key: string; label: string }[];
}

interface EmployeeForm {
  name: string;
  email: string;
  phone: string;
  password: string;
  roleId: string;
  status: 'active' | 'inactive';
}

const emptyEmployee: EmployeeForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  roleId: '',
  status: 'active',
};

interface RoleForm {
  name: string;
  description: string;
  permissions: string[];
  isActive: boolean;
}

const emptyRole: RoleForm = { name: '', description: '', permissions: [], isActive: true };

const TABS = [
  { value: 'staff', label: 'Staff' },
  { value: 'roles', label: 'Roles & permissions' },
];

export default function Employees() {
  const { has, user } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const canWrite = has('employees:write');

  const [tab, setTab] = useState('staff');

  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployee);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [employeeError, setEmployeeError] = useState('');

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  const [roleOpen, setRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>(emptyRole);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const employeesQuery = useQuery({
    queryKey: ['admin-employees'],
    queryFn: () => api.get<User[]>('/employees'),
  });

  const rolesQuery = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => api.get<Role[]>('/employees/roles'),
  });

  const permissionsQuery = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: () => api.get<PermissionGroup[]>('/employees/permissions'),
  });

  const employees = employeesQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const groups = permissionsQuery.data ?? [];

  const totalPermissions = useMemo(
    () => groups.reduce((sum, group) => sum + group.permissions.length, 0),
    [groups]
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
  };

  const openCreateEmployee = () => {
    setEditingEmployee(null);
    setEmployeeForm({ ...emptyEmployee, roleId: roles[0]?._id ?? '' });
    setEmployeeError('');
    setEmployeeOpen(true);
  };

  const openEditEmployee = (employee: User) => {
    setEditingEmployee(employee);
    setEmployeeForm({
      name: employee.name,
      email: employee.email,
      phone: employee.phone ?? '',
      password: '',
      roleId: employee.role?.id ?? '',
      status: employee.status === 'inactive' ? 'inactive' : 'active',
    });
    setEmployeeError('');
    setEmployeeOpen(true);
  };

  const submitEmployee = async () => {
    setEmployeeError('');
    if (employeeForm.name.trim().length < 2) return setEmployeeError('Enter the staff member’s name.');
    if (!/^\S+@\S+\.\S+$/.test(employeeForm.email.trim())) return setEmployeeError('Enter a valid email address.');
    if (!employeeForm.roleId) return setEmployeeError('Choose a role.');
    if (!editingEmployee && employeeForm.password.length < 8) {
      return setEmployeeError('Password must be at least 8 characters.');
    }

    setEmployeeSaving(true);
    try {
      if (editingEmployee) {
        await api.patch(`/employees/${editingEmployee._id ?? editingEmployee.id}`, {
          name: employeeForm.name.trim(),
          phone: employeeForm.phone.trim() || undefined,
          roleId: employeeForm.roleId,
          status: employeeForm.status,
        });
        success('Staff member updated.');
      } else {
        await api.post('/employees', {
          name: employeeForm.name.trim(),
          email: employeeForm.email.trim(),
          phone: employeeForm.phone.trim() || undefined,
          password: employeeForm.password,
          roleId: employeeForm.roleId,
          status: employeeForm.status,
        });
        success('Staff account created.');
      }
      setEmployeeOpen(false);
      refresh();
    } catch (submitError) {
      setEmployeeError(apiErrorMessage(submitError));
    } finally {
      setEmployeeSaving(false);
    }
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 8) return error('Password must be at least 8 characters.');
    setResetSaving(true);
    try {
      await api.post(`/employees/${resetTarget._id ?? resetTarget.id}/reset-password`, { newPassword });
      success(`Password reset for ${resetTarget.name}.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (resetError) {
      error(resetError);
    } finally {
      setResetSaving(false);
    }
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleForm(emptyRole);
    setRoleError('');
    setRoleOpen(true);
  };

  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description ?? '',
      permissions: [...role.permissions],
      isActive: role.isActive !== false,
    });
    setRoleError('');
    setRoleOpen(true);
  };

  const togglePermission = (key: string) =>
    setRoleForm((current) => ({
      ...current,
      permissions: current.permissions.includes(key)
        ? current.permissions.filter((permission) => permission !== key)
        : [...current.permissions, key],
    }));

  const toggleGroup = (group: PermissionGroup, checked: boolean) =>
    setRoleForm((current) => {
      const keys = group.permissions.map((permission) => permission.key);
      const remaining = current.permissions.filter((permission) => !keys.includes(permission));
      return { ...current, permissions: checked ? [...remaining, ...keys] : remaining };
    });

  const submitRole = async () => {
    setRoleError('');
    if (roleForm.name.trim().length < 2) return setRoleError('Enter a role name.');
    if (roleForm.permissions.length === 0) return setRoleError('Select at least one permission.');

    setRoleSaving(true);
    try {
      if (editingRole) {
        await api.patch(`/employees/roles/${editingRole._id}`, {
          name: roleForm.name.trim(),
          description: roleForm.description.trim() || undefined,
          permissions: roleForm.permissions,
          isActive: roleForm.isActive,
        });
        success('Role updated.');
      } else {
        await api.post('/employees/roles', {
          name: roleForm.name.trim(),
          description: roleForm.description.trim() || undefined,
          permissions: roleForm.permissions,
        });
        success('Role created.');
      }
      setRoleOpen(false);
      refresh();
    } catch (submitError) {
      setRoleError(apiErrorMessage(submitError));
    } finally {
      setRoleSaving(false);
    }
  };

  const removeRole = async () => {
    if (!deletingRole) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/employees/roles/${deletingRole._id}`);
      success('Role deleted.');
      setDeletingRole(null);
      refresh();
    } catch (deleteError) {
      error(deleteError);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Team"
        title="Employees & roles"
        description="Manage staff accounts and fine-grained permissions. Every permission is enforced by the API."
        action={
          canWrite ? (
            tab === 'staff' ? (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreateEmployee}>
                Add staff
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreateRole}>
                New role
              </Button>
            )
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Staff accounts"
          value={employees.length}
          hint="Active and inactive team members"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Roles"
          value={roles.length}
          hint="System and custom roles"
          icon={<Shield className="h-4 w-4" />}
          tone="gold"
        />
        <StatCard
          label="Permissions"
          value={totalPermissions}
          hint="Granular capabilities across the platform"
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="emerald"
        />
      </div>

      <div className="mb-4">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'staff' && (
        <>
          {employeesQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(employeesQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void employeesQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : employeesQuery.isLoading ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : employees.length === 0 ? (
            <Card>
              <EmptyState
                icon={<UserCog className="h-6 w-6" />}
                title="No staff accounts"
                description="Invite your first team member and assign a role."
                action={
                  canWrite ? (
                    <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={openCreateEmployee}>
                      Add staff
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-4 py-2.5">Staff member</th>
                      <th className="px-4 py-2.5">Contact</th>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Last login</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {employees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-gold dark:bg-gold dark:text-ink-950">
                              {initials(employee.name)}
                            </span>
                            <div>
                              <p className="font-medium text-ink-900 dark:text-white">
                                {employee.name}
                                {String(employee.id) === String(user?.id) && (
                                  <span className="ml-1 text-[10px] text-gold-600">(you)</span>
                                )}
                              </p>
                              <p className="text-xs text-ink-400">Joined {formatDate(employee.createdAt)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                          <p>{employee.email}</p>
                          {employee.phone && <p>{employee.phone}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={employee.role?.slug === 'super_admin' ? 'gold' : 'slate'}>
                            {employee.role?.name ?? 'No role'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(employee.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>
                            {employee.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                          {employee.lastLoginAt ? formatDate(employee.lastLoginAt, true) : 'Never'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {canWrite && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Edit ${employee.name}`}
                                onClick={() => openEditEmployee(employee)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canWrite && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Reset password for ${employee.name}`}
                                onClick={() => {
                                  setResetTarget(employee);
                                  setNewPassword('');
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'roles' && (
        <>
          {rolesQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(rolesQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void rolesQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : rolesQuery.isLoading ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roles.map((role) => (
                <Card key={role._id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
                          <Shield className="h-4 w-4" />
                        </span>
                        <div>
                          <h3 className="font-display text-base font-semibold">{role.name}</h3>
                          <p className="text-[11px] text-ink-400">{role.slug}</p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-ink-500 dark:text-ink-300">
                        {role.description || 'No description.'}
                      </p>
                    </div>
                    <Badge tone={role.isSystem ? 'gold' : 'slate'}>{role.isSystem ? 'System' : 'Custom'}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Badge tone="emerald">{role.permissions.length} permissions</Badge>
                    <Badge tone={role.isActive === false ? 'rose' : 'emerald'}>
                      {role.isActive === false ? 'Inactive' : 'Active'}
                    </Badge>
                    <Badge tone="slate">
                      {employees.filter((employee) => employee.role?.id === role._id).length} staff
                    </Badge>
                  </div>
                  {canWrite && (
                    <div className="mt-4 flex justify-end gap-1 border-t border-line pt-3 dark:border-ink-800">
                      <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEditRole(role)}>
                        Edit
                      </Button>
                      {!role.isSystem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 className="h-3.5 w-3.5 text-rose-500" />}
                          onClick={() => setDeletingRole(role)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Employee modal */}
      <Modal
        open={employeeOpen}
        onClose={() => {
          if (!employeeSaving) setEmployeeOpen(false);
        }}
        title={editingEmployee ? 'Edit staff member' : 'Add staff member'}
        description="Staff sign in with email and password. Permissions come from their role."
        footer={
          <>
            <Button variant="outline" onClick={() => setEmployeeOpen(false)} disabled={employeeSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitEmployee()} loading={employeeSaving}>
              {editingEmployee ? 'Save changes' : 'Create account'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {employeeError && <Alert tone="danger">{employeeError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input
                value={employeeForm.name}
                onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                value={employeeForm.email}
                disabled={Boolean(editingEmployee)}
                onChange={(event) => setEmployeeForm((current) => ({ ...current, email: event.target.value }))}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={employeeForm.phone}
                onChange={(event) => setEmployeeForm((current) => ({ ...current, phone: event.target.value }))}
              />
            </Field>
            <Field label="Role" required>
              <Select
                value={employeeForm.roleId}
                onChange={(event) => setEmployeeForm((current) => ({ ...current, roleId: event.target.value }))}
              >
                <option value="">Choose a role…</option>
                {roles.map((role) => (
                  <option key={role._id} value={role._id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!editingEmployee && (
            <Field label="Temporary password" required hint="At least 8 characters, with a letter and a number.">
              <Input
                type="password"
                value={employeeForm.password}
                onChange={(event) => setEmployeeForm((current) => ({ ...current, password: event.target.value }))}
              />
            </Field>
          )}
          <Field label="Status">
            <Select
              value={employeeForm.status}
              onChange={(event) =>
                setEmployeeForm((current) => ({ ...current, status: event.target.value as 'active' | 'inactive' }))
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={Boolean(resetTarget)}
        onClose={() => {
          if (!resetSaving) setResetTarget(null);
        }}
        title="Reset password"
        description={resetTarget ? `Set a new password for ${resetTarget.name}.` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitReset()} loading={resetSaving}>
              Reset password
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning">
            The staff member will be signed out of existing sessions and must use the new password.
          </Alert>
          <Field label="New password" required hint="At least 8 characters, with a letter and a number.">
            <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* Role modal */}
      <Modal
        open={roleOpen}
        onClose={() => {
          if (!roleSaving) setRoleOpen(false);
        }}
        title={editingRole ? 'Edit role' : 'New role'}
        description={
          editingRole?.slug === 'super_admin'
            ? 'Super Admin always has every permission and cannot be restricted.'
            : 'Select the capabilities this role should have.'
        }
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setRoleOpen(false)} disabled={roleSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitRole()} loading={roleSaving}>
              {editingRole ? 'Save role' : 'Create role'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {roleError && <Alert tone="danger">{roleError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role name" required>
              <Input
                value={roleForm.name}
                disabled={Boolean(editingRole?.isSystem)}
                onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field label="Description">
              <Input
                value={roleForm.description}
                onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))}
              />
            </Field>
          </div>

          {editingRole && (
            <Checkbox
              label="Role is active"
              description="Inactive roles cannot be assigned to new staff."
              checked={roleForm.isActive}
              onChange={(checked) => setRoleForm((current) => ({ ...current, isActive: checked }))}
            />
          )}

          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-ink-700 dark:text-ink-200">
              Permissions
              <span className="ml-2 text-xs font-normal text-ink-400">
                {roleForm.permissions.length} selected
              </span>
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRoleForm((current) => ({
                    ...current,
                    permissions: groups.flatMap((group) => group.permissions.map((permission) => permission.key)),
                  }))
                }
              >
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRoleForm((current) => ({ ...current, permissions: [] }))}>
                Clear
              </Button>
            </div>
          </div>

          {permissionsQuery.isLoading ? (
            <TableSkeleton rows={5} />
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const keys = group.permissions.map((permission) => permission.key);
                const allSelected = keys.every((key) => roleForm.permissions.includes(key));
                return (
                  <div key={group.group} className="rounded-xl border border-line p-3 dark:border-ink-800">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{group.group}</p>
                      <Checkbox
                        label={<span className="text-xs text-ink-400">Select group</span>}
                        checked={allSelected}
                        onChange={(checked) => toggleGroup(group, checked)}
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.permissions.map((permission) => (
                        <Checkbox
                          key={permission.key}
                          label={permission.label}
                          description={permission.key}
                          checked={roleForm.permissions.includes(permission.key)}
                          onChange={() => togglePermission(permission.key)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingRole)}
        onClose={() => setDeletingRole(null)}
        onConfirm={() => void removeRole()}
        title="Delete role"
        description={`Delete the ${deletingRole?.name ?? ''} role? Roles assigned to staff cannot be deleted.`}
        confirmLabel="Delete role"
        danger
        loading={deleteLoading}
      />

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        Permission changes take effect on the staff member’s next request — the API checks every route.
      </div>
    </div>
  );
}
