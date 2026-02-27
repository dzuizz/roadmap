import { createClient } from "@/lib/supabase/client";
import type { Roadmap } from "@/types/database";
import { v4 as uuidv4 } from "uuid";

function getSupabase() {
  return createClient();
}

function throwIfError(error: { message: string; code?: string; details?: string; hint?: string } | null) {
  if (error) {
    throw new Error(`${error.message}${error.hint ? ` (${error.hint})` : ""}${error.code ? ` [${error.code}]` : ""}`);
  }
}

export async function fetchRoadmaps(): Promise<Roadmap[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("roadmaps")
    .select("*")
    .order("updated_at", { ascending: false });

  throwIfError(error);
  return data ?? [];
}

export async function createRoadmap(
  title: string,
  description?: string
): Promise<Roadmap> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const roadmapId = uuidv4();
  const rootNodeId = uuidv4();

  // 1. Create roadmap without root_node_id (node doesn't exist yet)
  const { error: roadmapError } = await supabase
    .from("roadmaps")
    .insert({
      id: roadmapId,
      user_id: user.id,
      title,
      description: description || null,
    });

  throwIfError(roadmapError);

  // 2. Create the root node
  const { error: nodeError } = await supabase.from("nodes").insert({
    id: rootNodeId,
    roadmap_id: roadmapId,
    parent_id: null,
    path: `/${rootNodeId}`,
    position: 0,
    title,
  });

  throwIfError(nodeError);

  // 3. Link root node back to roadmap
  const { data: roadmap, error: updateError } = await supabase
    .from("roadmaps")
    .update({ root_node_id: rootNodeId })
    .eq("id", roadmapId)
    .select()
    .single();

  throwIfError(updateError);

  return roadmap;
}

export async function updateRoadmap(
  id: string,
  updates: Partial<Pick<Roadmap, "title" | "description">>
): Promise<Roadmap> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("roadmaps")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  throwIfError(error);
  return data;
}

export async function deleteRoadmap(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("roadmaps").delete().eq("id", id);
  throwIfError(error);
}
