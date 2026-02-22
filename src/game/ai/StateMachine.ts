export type StateUpdateResult<TStateId extends string> = TStateId | void;

export type StateDefinition<TContext, TStateId extends string> = {
  readonly id: TStateId;
  onEnter?: (context: TContext, previousStateId: TStateId | null) => void;
  onExit?: (context: TContext, nextStateId: TStateId | null) => void;
  update: (context: TContext, deltaTime: number) => StateUpdateResult<TStateId>;
};

export class StateMachine<TContext, TStateId extends string> {
  private readonly states = new Map<TStateId, StateDefinition<TContext, TStateId>>();
  private currentStateId: TStateId | null = null;

  constructor(
    private readonly context: TContext,
    stateDefinitions: readonly StateDefinition<TContext, TStateId>[],
    initialStateId: TStateId
  ) {
    for (const state of stateDefinitions) {
      this.states.set(state.id, state);
    }

    this.transitionTo(initialStateId);
  }

  getCurrentStateId(): TStateId | null {
    return this.currentStateId;
  }

  update(deltaTime: number): void {
    if (deltaTime <= 0 || this.currentStateId === null) {
      return;
    }

    const currentState = this.states.get(this.currentStateId);
    if (!currentState) {
      return;
    }

    const requestedStateId = currentState.update(this.context, deltaTime);
    if (requestedStateId && requestedStateId !== this.currentStateId) {
      this.transitionTo(requestedStateId);
    }
  }

  transitionTo(nextStateId: TStateId): void {
    const nextState = this.states.get(nextStateId);
    if (!nextState) {
      throw new Error(`StateMachine: state "${nextStateId}" is not registered.`);
    }

    const previousStateId = this.currentStateId;
    if (previousStateId === nextStateId) {
      return;
    }

    const previousState =
      previousStateId !== null ? this.states.get(previousStateId) ?? null : null;
    previousState?.onExit?.(this.context, nextStateId);

    this.currentStateId = nextStateId;
    nextState.onEnter?.(this.context, previousStateId);
  }
}
