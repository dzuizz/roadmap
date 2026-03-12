"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchMembers, addMember, removeMember, updateMemberRole } from "@/lib/api/members";
import { findUserByEmail } from "@/lib/api/users";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { Member, MemberRole } from "@/types/database";

interface ShareDialogProps {
  roadmapId: string;
  roadmapTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({ roadmapId, roadmapTitle, open, onOpenChange }: ShareDialogProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const currentUid = getFirebaseAuth().currentUser?.uid;
  const currentMember = members.find((m) => m.userId === currentUid);
  const isOwner = currentMember?.role === "owner";

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchMembers(roadmapId)
      .then(setMembers)
      .catch((err) => console.error("Failed to load members:", err))
      .finally(() => setLoading(false));
  }, [open, roadmapId]);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const found = await findUserByEmail(inviteEmail.trim());
      if (!found) {
        setInviteError("No user found with that email address.");
        return;
      }
      await addMember(roadmapId, found.uid, inviteRole, roadmapTitle, found.email, found.displayName);
      const updated = await fetchMembers(roadmapId);
      setMembers(updated);
      setInviteEmail("");
      setInviteRole("viewer");
    } catch (err) {
      console.error("Failed to invite member:", err);
      setInviteError("Failed to invite. Please try again.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      await removeMember(roadmapId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  }

  async function handleRoleChange(userId: string, role: MemberRole) {
    try {
      await updateMemberRole(roadmapId, userId, role);
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role } : m))
      );
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{roadmapTitle}&rdquo;</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Invite form — owners only */}
          {isOwner && (
            <div className="space-y-2">
              <Label>Invite by email</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleInvite();
                  }}
                  className="flex-1"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0 capitalize">
                      {inviteRole}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setInviteRole("editor")}>
                      Editor
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setInviteRole("viewer")}>
                      Viewer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="shrink-0"
                >
                  {inviting ? "Inviting…" : "Invite"}
                </Button>
              </div>
              {inviteError && (
                <p className="text-xs text-destructive">{inviteError}</p>
              )}
            </div>
          )}

          {/* Members list */}
          <div className="space-y-1">
            <Label>Members</Label>
            {loading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="mt-1 space-y-1">
                {members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      {member.displayName && (
                        <p className="font-medium truncate">{member.displayName}</p>
                      )}
                      <p className="truncate text-muted-foreground text-xs">
                        {member.email ?? member.userId}
                      </p>
                    </div>

                    {/* Owner cannot be changed; for non-owners, show controls if current user is owner */}
                    {member.role === "owner" || !isOwner ? (
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground capitalize">
                        {member.role}
                      </span>
                    ) : (
                      <div className="ml-2 flex shrink-0 items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs capitalize"
                            >
                              {member.role}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleRoleChange(member.userId, "editor")}
                            >
                              Editor
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRoleChange(member.userId, "viewer")}
                            >
                              Viewer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleRemove(member.userId)}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
