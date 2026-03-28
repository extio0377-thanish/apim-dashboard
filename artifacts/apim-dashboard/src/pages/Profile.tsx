import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, THEMES, type ThemeName } from "@/contexts/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { validatePassword, DEFAULT_POLICY, type PasswordPolicy } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { UserCircle, Palette, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Profile() {
  const { user, authFetch, refreshUser } = useAuth();
  const { theme, setTheme, themeOption } = useTheme();
  const { toast } = useToast();

  const [profile, setProfile] = useState({ fullName: user?.fullName ?? "", mobile: user?.mobile ?? "" });
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwd, setPwd] = useState({ current: "", newPwd: "", confirm: "" });
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });
  const [savingPwd, setSavingPwd] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);

  const pwdCheck = pwd.newPwd ? validatePassword(pwd.newPwd, policy) : null;

  useEffect(() => {
    setProfile({ fullName: user?.fullName ?? "", mobile: user?.mobile ?? "" });
  }, [user]);

  useEffect(() => {
    authFetch(`${BASE}/api/password-policy`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setPolicy(d); });
  }, [authFetch]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await authFetch(`${BASE}/api/profile`, {
        method: "PUT",
        body: JSON.stringify({ fullName: profile.fullName, mobile: profile.mobile, theme }),
      });
      if (res.ok) { await refreshUser(); toast({ title: "Profile updated" }); }
      else { const d = await res.json(); toast({ title: d.error || "Failed", variant: "destructive" }); }
    } finally { setSavingProfile(false); }
  };

  const changePassword = async () => {
    if (!pwd.current || !pwd.newPwd) { toast({ title: "Fill all password fields", variant: "destructive" }); return; }
    if (pwd.newPwd !== pwd.confirm) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }
    const chk = validatePassword(pwd.newPwd, policy);
    if (!chk.valid) { toast({ title: "Password policy violation", description: chk.errors.join(", "), variant: "destructive" }); return; }
    setSavingPwd(true);
    try {
      const res = await authFetch(`${BASE}/api/profile/password`, {
        method: "PUT",
        body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.newPwd }),
      });
      if (res.ok) { toast({ title: "Password changed successfully" }); setPwd({ current: "", newPwd: "", confirm: "" }); }
      else { const d = await res.json(); toast({ title: d.error || "Failed", variant: "destructive" }); }
    } finally { setSavingPwd(false); }
  };

  const handleThemeChange = async (t: ThemeName) => {
    setTheme(t);
    await authFetch(`${BASE}/api/profile`, { method: "PUT", body: JSON.stringify({ theme: t }) });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserCircle className="w-6 h-6 text-primary" /> My Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your personal details, password and appearance</p>
      </div>

      {/* Personal Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
          <CardDescription>Update your name, mobile and display preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={profile.fullName} onChange={(e) => setProfile({ ...profile, fullName: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile</Label>
              <Input value={profile.mobile} onChange={(e) => setProfile({ ...profile, mobile: e.target.value })} placeholder="+1234567890" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled className="bg-muted/40 text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={user?.role ?? ""} disabled className="bg-muted/40 text-muted-foreground" />
            </div>
          </div>
          <Button onClick={saveProfile} disabled={savingProfile} className="gap-2">
            {savingProfile ? "Saving…" : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Theme Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4 text-primary" /> Theme & Appearance</CardTitle>
          <CardDescription>Choose your preferred color theme. Changes apply immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {THEMES.map((t) => (
              <button
                key={t.name}
                onClick={() => handleThemeChange(t.name)}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all hover:scale-105 cursor-pointer",
                  theme === t.name ? "border-primary shadow-md" : "border-border hover:border-muted-foreground/30"
                )}
              >
                <div className="w-10 h-10 rounded-full shadow-inner flex items-center justify-center" style={{ background: t.hex }}>
                  {theme === t.name && <CheckCircle2 className="w-5 h-5 text-white drop-shadow" />}
                </div>
                <span className="text-xs font-medium text-foreground">{t.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Current theme: <span className="font-semibold" style={{ color: themeOption.hex }}>{themeOption.label}</span>
          </p>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> Change Password</CardTitle>
          <CardDescription>Use a strong password that meets the policy requirements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["current", "new", "confirm"] as const).map((field) => {
            const labels = { current: "Current Password", new: "New Password", confirm: "Confirm New Password" };
            const values = { current: pwd.current, new: pwd.newPwd, confirm: pwd.confirm };
            const handlers = {
              current: (v: string) => setPwd({ ...pwd, current: v }),
              new: (v: string) => setPwd({ ...pwd, newPwd: v }),
              confirm: (v: string) => setPwd({ ...pwd, confirm: v }),
            };
            return (
              <div key={field} className="space-y-1.5">
                <Label>{labels[field]}</Label>
                <div className="relative">
                  <Input
                    type={showPwd[field] ? "text" : "password"}
                    value={values[field]}
                    onChange={(e) => handlers[field](e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPwd((p) => ({ ...p, [field]: !p[field] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPwd[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}

          {pwdCheck && (
            <div className="space-y-2">
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

          {pwd.confirm && pwd.newPwd !== pwd.confirm && (
            <p className="text-xs text-destructive">Passwords do not match</p>
          )}

          <Button onClick={changePassword} disabled={savingPwd} className="gap-2">
            <KeyRound className="w-4 h-4" />
            {savingPwd ? "Changing…" : "Change Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
