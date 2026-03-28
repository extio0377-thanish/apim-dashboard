import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { validatePassword } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, ShieldAlert, CheckCircle2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Policy { minLength: number; minUppercase: number; minLowercase: number; minNumbers: number; minSpecial: number; }

const FIELDS: { key: keyof Policy; label: string; desc: string; min: number }[] = [
  { key: "minLength",    label: "Minimum Length",            desc: "Minimum total number of characters",      min: 4  },
  { key: "minUppercase", label: "Min Uppercase Letters (A-Z)", desc: "Require at least N uppercase letters",    min: 0  },
  { key: "minLowercase", label: "Min Lowercase Letters (a-z)", desc: "Require at least N lowercase letters",    min: 0  },
  { key: "minNumbers",   label: "Min Numbers (0-9)",           desc: "Require at least N numeric digits",       min: 0  },
  { key: "minSpecial",   label: "Min Special Characters",      desc: "Require at least N non-alphanumeric chars", min: 0 },
];

export default function PasswordPolicy() {
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const [policy, setPolicy] = useState<Policy>({ minLength: 8, minUppercase: 1, minLowercase: 1, minNumbers: 1, minSpecial: 1 });
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const previewCheck = preview ? validatePassword(preview, policy) : null;

  const load = async () => {
    try {
      const res = await authFetch(`${BASE}/api/password-policy`);
      if (res.ok) { const data = await res.json(); setPolicy(data); }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`${BASE}/api/password-policy`, { method: "PUT", body: JSON.stringify(policy) });
      if (res.ok) { toast({ title: "Password policy updated" }); }
      else { const d = await res.json(); toast({ title: d.error || "Failed", variant: "destructive" }); }
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading policy…</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Lock className="w-6 h-6 text-primary" /> Password Policy</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure password complexity requirements enforced globally</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-primary" /> Policy Settings</CardTitle>
            <CardDescription>These rules apply to all user passwords</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="font-medium">{f.label}</Label>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={f.min}
                    max={50}
                    value={policy[f.key]}
                    onChange={(e) => setPolicy({ ...policy, [f.key]: Math.max(f.min, Number(e.target.value)) })}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">character{policy[f.key] !== 1 ? "s" : ""}</span>
                </div>
              </div>
            ))}
            <Button onClick={save} disabled={saving} className="w-full mt-2">
              {saving ? "Saving…" : "Save Policy"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" /> Live Preview</CardTitle>
            <CardDescription>Test a password against the current policy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Test Password</Label>
              <Input type="text" value={preview} onChange={(e) => setPreview(e.target.value)} placeholder="Type a password to test…" />
            </div>
            {previewCheck && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Strength</span>
                    <span className="font-medium" style={{ color: previewCheck.valid ? "#16a34a" : previewCheck.score >= 60 ? "#d97706" : "#dc2626" }}>
                      {previewCheck.valid ? "Strong" : previewCheck.score >= 60 ? "Moderate" : "Weak"}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${previewCheck.score}%`, background: previewCheck.valid ? "#16a34a" : previewCheck.score >= 60 ? "#d97706" : "#dc2626" }} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: `Min ${policy.minLength} chars`, ok: preview.length >= policy.minLength },
                    { label: `${policy.minUppercase} uppercase`, ok: (preview.match(/[A-Z]/g)||[]).length >= policy.minUppercase },
                    { label: `${policy.minLowercase} lowercase`, ok: (preview.match(/[a-z]/g)||[]).length >= policy.minLowercase },
                    { label: `${policy.minNumbers} number(s)`, ok: (preview.match(/[0-9]/g)||[]).length >= policy.minNumbers },
                    { label: `${policy.minSpecial} special char(s)`, ok: (preview.match(/[^A-Za-z0-9]/g)||[]).length >= policy.minSpecial },
                  ].map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={r.ok ? "text-green-600" : "text-red-500"}>
                        {r.ok ? "✓" : "✗"}
                      </span>
                      <span className={r.ok ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!preview && (
              <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4 text-center">
                Type a password above to test it against the current policy
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
