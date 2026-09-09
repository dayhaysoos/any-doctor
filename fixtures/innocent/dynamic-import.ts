import { Widget } from "./widget";

export async function main(): Promise<number> {
  const module = await import("./widget");
  return module.Widget() + Widget();
}
