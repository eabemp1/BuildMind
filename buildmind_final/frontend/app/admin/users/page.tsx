"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AdminUserRow, getAdminUsers, promoteUserToAdmin, suspendUser } from "@/lib/admin";

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (search?: string) => {
    try {
      setLoading(true);
      setError("");
      setUsers(await getAdminUsers(search));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onPromote = async (userId: string) => {
    try {
      setBusyId(userId);
      await promoteUserToAdmin(userId);
      await load(query.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote user");
    } finally {
      setBusyId(null);
    }
  };

  const onSuspend = async (userId: string) => {
    try {
      setBusyId(userId);
      await suspendUser(userId);
      await load(query.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to suspend account");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Users</h1>
          <p className="text-body mt-1">Manage accounts, permissions, and account status.</p>
        </div>
        <div className="flex w-full max-w-md gap-2">
          <Input
            placeholder="Search by email or username"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="outline" className="border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10" onClick={() => void load(query.trim() || undefined)}>
            Search
          </Button>
        </div>
      </div>

      <Card className="glass-panel panel-glow">
        <CardHeader>
          <CardTitle className="text-zinc-100">All Users</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? <p className="text-sm text-zinc-400">Loading users...</p> : null}
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          {!loading ? (
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Signup Date</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Projects</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-3 pr-4 font-medium text-zinc-100">{user.email}</td>
                    <td className="py-3 pr-4 text-zinc-400">{fmtDate(user.createdAt)}</td>
                    <td className="py-3 pr-4">
                      <Badge className={user.role === "admin" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : ""}>
                        {user.role}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">{user.projectCount}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={busyId === user.id || user.role === "admin"}
                          onClick={() => void onPromote(user.id)}
                        >
                          Promote
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={busyId === user.id || !user.isActive}
                          onClick={() => void onSuspend(user.id)}
                        >
                          Suspend
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length ? (
                  <tr>
                    <td className="py-4 text-zinc-500" colSpan={5}>
                      No users found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
