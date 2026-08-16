export interface MainOperationRunner {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export class MainOperationCoordinator implements MainOperationRunner {
  private operationTail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
