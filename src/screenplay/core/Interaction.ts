import type { Actor } from "./Actor";
import type { Activity } from "./Activity";

export class Interaction implements Activity {
  constructor(
    private readonly description: string,
    private readonly body: (actor: Actor) => Promise<void>
  ) {}

  static where(description: string, body: (actor: Actor) => Promise<void>): Interaction {
    return new Interaction(description, body);
  }

  async performAs(actor: Actor): Promise<void> {
    await this.body(actor);
  }

  toString(): string {
    return this.description;
  }
}
