import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldPlus, Pencil, Trash2, ShieldCheck } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Permission { key: string; label: string; }
interface Role { id: string; name: string; permissions: string[]; createdAt: string; }

export default function Roles() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([authFetch(`${BASE}/api/roles`), authFetch(`${BASE}/api/roles/permissions`)]);
      if (rRes.ok) setRoles(await rRes.json());
      if (pRes.ok) setAllPermissions(await pRes.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setName(""); setSelected([]); setOpen(true); };
  const openEdit = (r: Role) => { setEditing(r); setName(r.name); setSelected(r.permissions); setOpen(true); };

  const toggle = (key: string) => setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

  const save = async () => {
    if (!name.trim()) { toast({ title: "Role name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editing ? `${BASE}/api/roles/${editing.id}` : `${BASE}/api/roles`;
      const res = await authFetch(url, { method: editing ? "PUT" : "POST", body: JSON.stringify({ name, permissions: selected }) });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || "Failed", variant: "destructive" }); return; }
      toast({ title: editing ? "Role updated" : "Role created" });
      setOpen(false);
      load();
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    const res = await authFetch(`${BASE}/api/roles/${id}`, { method: "DELETE" });
    if (res.ok) { toast({ title: "Role deleted" }); load(); }
    else { const d = await res.json(); toast({ title: d.error || "Failed", variant: "destructive" }); }
    setDeleteId(null);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-primary" /> Roles & Permissions</h1>
          <p className="text-muted-foreground text-sm mt-1">Define roles and their access permissions</p>
        </div>
        <Button onClick={openCreate} className="gap-2"><ShieldPlus className="w-4 h-4" /> New Role</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role Name</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : roles.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">No roles found</TableCell></TableRow>
              ) : roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.permissions.length === 0 ? <span className="text-muted-foreground text-xs">No permissions</span> : r.permissions.map((p) => {
                        const found = allPermissions.find((ap) => ap.key === p);
                        return <Badge key={p} variant="secondary" className="text-xs">{found?.label ?? p}</Badge>;
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Role" : "Create Role"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Role Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operator" />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="rounded-lg border border-border divide-y divide-border">
                {allPermissions.map((p) => (
                  <label key={p.key} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                    <Checkbox checked={selected.includes(p.key)} onCheckedChange={() => toggle(p.key)} />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Role</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete this role? Users assigned to it will lose their role.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && remove(deleteId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
