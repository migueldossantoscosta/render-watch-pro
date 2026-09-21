export type EngineId = "blender" | "after_effects";

export type EngineDefinition = {
  id: EngineId;
  processName: string;
};

export const ENGINES: EngineDefinition[] = [
  { id: "blender", processName: "blender.exe" },
  { id: "after_effects", processName: "aerender.exe" },
];
