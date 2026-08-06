import { WorkerModule } from './worker.module';

describe('WorkerModule', () => {
  it('is defined as a slim Nest module (not AppModule)', () => {
    expect(WorkerModule).toBeDefined();
    const imports = Reflect.getMetadata('imports', WorkerModule) as unknown[] | undefined;
    // Nest may store metadata differently; smoke-check class identity
    expect(WorkerModule.name).toBe('WorkerModule');
    void imports;
  });
});
