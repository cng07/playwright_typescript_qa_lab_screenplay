import type { Activity } from "./Activity";
import type { Question } from "./Question";

export class Actor {
  private readonly abilities = new Map<string, unknown>();
  private readonly notes = new Map<string, unknown>();

  constructor(public readonly name: string) {}

  whoCan(...abilities: unknown[]): this {
    for (const ability of abilities) {
      const key = ability && typeof ability === "object" ? ability.constructor.name : typeof ability;
      this.abilities.set(key, ability);
    }
    return this;
  }

  abilityTo<T>(abilityType: { name: string; prototype: T }): T {
    const ability = this.abilities.get(abilityType.name);

    if (!ability) {
      throw new Error(`${this.name} does not have the ${abilityType.name} ability.`);
    }

    return ability as T;
  }

  async attemptsTo(...activities: Activity[]): Promise<void> {
    for (const activity of activities) {
      await activity.performAs(this);
    }
  }

  async asks<T>(question: Question<T>): Promise<T> {
    return question.answeredBy(this);
  }

  remember<T>(key: string, value: T): void {
    this.notes.set(key, value);
  }

  recall<T>(key: string): T {
    if (!this.notes.has(key)) {
      throw new Error(`${this.name} has no memory stored for "${key}".`);
    }

    return this.notes.get(key) as T;
  }
}
