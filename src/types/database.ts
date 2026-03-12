export interface Roadmap {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  rootNodeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Node {
  id: string;
  roadmapId: string;
  parentId: string | null;
  path: string;
  position: number;
  title: string;
  description: string | null;
  link: string | null;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MemberRole = "owner" | "editor" | "viewer";

export interface Member {
  userId: string;
  role: MemberRole;
  addedAt: string;
  email?: string;
  displayName?: string;
}

export interface TrashEntry {
  id: string;
  roadmapId: string;
  nodeSnapshot: NodeSnapshot;
  parentId: string | null;
  originalNodeId: string;
  deletedAt: string;
  expiresAt: string;
}

export interface NodeSnapshot {
  node: Node;
  children: NodeSnapshot[];
}

export type RoadmapInsert = Pick<Roadmap, "title" | "description">;
export type NodeUpdate = Partial<
  Pick<Node, "title" | "description" | "link" | "isCompleted" | "position" | "parentId">
>;

export interface UserRoadmapEntry {
  roadmapId: string;
  role: MemberRole;
  title: string;
  updatedAt: string;
}
