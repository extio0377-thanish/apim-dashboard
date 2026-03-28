import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { validatePassword, DEFAULT_POLICY, type PasswordPolicy } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Pencil, Trash2, Eye, EyeOff, Users as UsersIcon } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Role { id: string; name: string; }
interface User { id: string; fullName: string; email: string; mobile?: string; role?: string; roleId?: string; active: boolean; createdAt: string; }

const EMPTY_FORM = { fullName: "", email: "", mobile: "", password: "", roleId: "", active: true };

export default function Users() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const pwdCheck = form.password ? validatePassword(form.password, policy) : null;

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, rRes, pRes] = await Promise.all([
        authFetch(`${BASE}/api/users`),
        authFetch(`${BASE}/api/roles`),
        authFetch(`${BASE}/api/password-policy`),
      ]);
      if (uRes.ok) setUsers(await uRes.json());
      if (rRes.ok) setRoles(await rRes.json());
      if (pRes.ok) setPolicy(await pRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowPwd(false); setOpen(true); };
  const openEdit = (u: User) => { setEditing(u); setForm({ fullName: u.fullName, email: u.email, mobile: u.mobile ?? "", password: "", roleId: u.roleId ?? "", active: u.active }); setShowPwd(false); setOpen(true); };

  const save = async () => {
    if (!form.fullName || !form.email) { toast({ title: "Name and email are required", variant: "destructive" }); return; }
    if (!editing && !form.password) { toast({ title: "Password is required", variant: "destructive" }); return; }
    if (form.password) {
      const chk = validatePassword(form.password, policy);
      if (!chk.valid) { toast({ title: "Password policy violation", description: chk.errors.join(", "), variant: "destructive" }); return; }
    }
    setSaving(true);
    try {
      const url = editing ? `${BASE}/api/users/${editing.id}` : `${BASE}/api/users`;
      const body: Record<string, unknown> = { fullName: form.fullName, email: form.email, mobile: form.mobile, roleId: form.roleId || null, active: form.active };
      if (form.password) body.password = form.password;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Failed", description: (data.details || []).join(", "), variant: "destructive" }); return; }
      toast({ title: editing ? "User updated" : "User created" });
      setOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const res = await authFetch(`${BASE}/api/users/${id}`, { method: "DELETE" });
    if (res.ok) { toast({ title: "User deleted" }); load(); }
    else { const d = await res.json(); toast({ title: d.error || "Failed", variant: "destructive" }); }
    setDeleteId(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UsersIcon className="w-6 h-6 text-primary" /> User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and manage user accounts and their roles</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><UserPlus className="w-4 h-4" /> New User</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Full Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No users found</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{u.mobile || "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{u.role || "—"}</Badge></TableCell>
                  <TableCell><Badge variant={u.active ? "default" : "outline"}>{u.active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(u.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit User" : "Create User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile</Label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="+1234567890" />
            </div>
            <div className="space-y-1.5">
              <Label>{editing ? "New Password (leave blank to keep)" : "Password *"}</Label>
              <div className="relative">
                <Input type={showPwd ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" className="pr-10" />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {pwdCheck && (
                <div className="space-y-1 mt-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pwdCheck.score}%`, background: pwdCheck.valid ? "#16a34a" : pwdCheck.score >= 60 ? "#d97706" : "#dc2626" }} />
                    </div>
                    <span className="text-xs font-medium" style={{ color: pwdCheck.valid ? "#16a34a" : pwdCheck.score >= 60 ? "#d97706" : "#dc2626" }}>
                      {pwdCheck.valid ? "Strong" : pwdCheck.score >= 60 ? "Moderate" : "Weak"}
                    </span>
                  </div>
                  {pwdCheck.errors.length > 0 && (
                    <ul className="text-xs text-destructive space-y-0.5 pl-2">
                      {pwdCheck.errors.map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.roleId} onValueChange={(v) => setForm({ ...form, roleId: v })}>
                <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} id="active" />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete User</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this user? This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && remove(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
