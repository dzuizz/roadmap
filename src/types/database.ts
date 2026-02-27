export interface Roadmap {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  root_node_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Node {
  id: string;
  roadmap_id: string;
  parent_id: string | null;
  path: string;
  position: number;
  title: string;
  description: string | null;
  link: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TrashEntry {
  id: string;
  roadmap_id: string;
  node_snapshot: NodeSnapshot;
  parent_id: string | null;
  original_node_id: string;
  deleted_at: string;
  expires_at: string;
}

export interface NodeSnapshot {
  node: Omit<Node, "deleted_at">;
  children: NodeSnapshot[];
}

export type RoadmapInsert = Pick<Roadmap, "title" | "description">;
export type NodeInsert = Pick<
  Node,
  "roadmap_id" | "parent_id" | "title" | "description" | "link"
>;
export type NodeUpdate = Partial<
  Pick<Node, "title" | "description" | "link" | "is_completed" | "position" | "parent_id">
>;
