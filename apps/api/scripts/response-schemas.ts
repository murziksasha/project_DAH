/**
 * Phase 4: OpenAPI response schemas derived from the controllers' actual TypeScript return types.
 * Nest/Swagger only knows response shapes from hand-written @ApiOkResponse DTOs; this walks every
 * HTTP handler with the TS checker (Promise unwrapped) and converts the type to JSON Schema, so
 * the documented response can never drift from the code. Rules:
 *   Date → string(date-time) · Prisma Decimal → string · Buffer/StreamableFile → binary
 *   Prisma Json → {} · functions dropped · recursion / depth > MAX_DEPTH → {}.
 * Handlers that write the raw response (@Res() without passthrough) are skipped.
 */
import * as ts from 'typescript';
import { dirname, join, resolve } from 'path';

export type JsonSchema = Record<string, unknown>;
export interface HandlerResponse {
  controller: string;
  handler: string;
  schema: JsonSchema | null;
  binary?: boolean;
}

const HTTP = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head']);
const MAX_DEPTH = 6;

export function collectResponseSchemas(tsconfigPath = resolve(__dirname, '../tsconfig.json')) {
  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, dirname(tsconfigPath));
  const program = ts.createProgram(
    parsed.fileNames.filter((f) => f.endsWith('.controller.ts')),
    { ...parsed.options, noEmit: true },
  );
  const checker = program.getTypeChecker();
  const components: Record<string, JsonSchema> = {};
  const out: HandlerResponse[] = [];

  const decoName = (d: ts.Decorator) => {
    const e = d.expression;
    return ts.isCallExpression(e) && ts.isIdentifier(e.expression) ? e.expression.text : undefined;
  };

  const usesRawRes = (m: ts.MethodDeclaration) =>
    m.parameters.some((p) =>
      (ts.getDecorators(p) ?? []).some((d) => {
        if (decoName(d) !== 'Res') return false;
        const arg = (d.expression as ts.CallExpression).arguments[0];
        return !(arg && /passthrough\s*:\s*true/.test(arg.getText()));
      }),
    );

  const convert = (type: ts.Type, depth: number, stack: Set<ts.Type>): JsonSchema => {
    if (depth > MAX_DEPTH || stack.has(type)) return {};
    const f = type.flags;
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
    if (f & ts.TypeFlags.StringLiteral) return { type: 'string', enum: [(type as ts.StringLiteralType).value] };
    if (f & ts.TypeFlags.NumberLiteral) return { type: 'number', enum: [(type as ts.NumberLiteralType).value] };
    if (f & ts.TypeFlags.BooleanLiteral) return { type: 'boolean', enum: [checker.typeToString(type) === 'true'] };
    if (f & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral)) return { type: 'string' };
    if (f & ts.TypeFlags.Number) return { type: 'number' };
    if (f & ts.TypeFlags.Boolean) return { type: 'boolean' };
    if (f & (ts.TypeFlags.BigInt | ts.TypeFlags.BigIntLiteral)) return { type: 'string', format: 'int64' };
    if (f & ts.TypeFlags.Null) return { type: 'null' };
    if (f & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Never)) return {};
    const alias = type.aliasSymbol?.name;
    if (alias && /^(Input)?Json(Value|Object|Array)?$/.test(alias)) return {};
    const sym = type.getSymbol();
    const name = sym?.name;
    if (name === 'String') return { type: 'string' };
    if (name === 'Number') return { type: 'number' };
    if (name === 'Boolean') return { type: 'boolean' };
    if (name === 'Date') return { type: 'string', format: 'date-time' };
    if (name === 'Decimal') return { type: 'string', description: 'Decimal' };
    if (name === 'Buffer' || name === 'StreamableFile' || name === 'Uint8Array' || name === 'Readable')
      return { type: 'string', format: 'binary' };
    if (type.isUnion()) {
      const parts = type.types.filter((t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
      if (parts.length && parts.every((t) => t.flags & ts.TypeFlags.StringLiteral))
        return { type: 'string', enum: parts.map((t) => (t as ts.StringLiteralType).value) };
      if (parts.length && parts.every((t) => t.flags & ts.TypeFlags.BooleanLiteral)) return { type: 'boolean' };
      const schemas = parts.map((t) => convert(t, depth, stack));
      const nonNull = schemas.filter((s) => s.type !== 'null');
      const nullable = nonNull.length < schemas.length;
      const uniq = dedupe(nonNull);
      const base: JsonSchema = uniq.length === 1 ? { ...uniq[0] } : uniq.length ? { anyOf: uniq } : {};
      if (nullable && Object.keys(base).length) base.nullable = true;
      return base;
    }
    if (type.isIntersection()) return objectSchema(type, depth, stack);
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      const args = checker.getTypeArguments(type as ts.TypeReference);
      const items = checker.isTupleType(type) ? dedupe(args.map((a) => convert(a, depth + 1, stack))) : [convert(args[0], depth + 1, stack)];
      return { type: 'array', items: items.length === 1 ? items[0] : { anyOf: items } };
    }
    if (f & ts.TypeFlags.Object) return objectSchema(type, depth, stack);
    return {};
  };

  const objectSchema = (type: ts.Type, depth: number, stack: Set<ts.Type>): JsonSchema => {
    if (type.getCallSignatures().length && !checker.getPropertiesOfType(type).length) return {};
    stack.add(type);
    try {
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const p of checker.getPropertiesOfType(type)) {
        const decl = p.valueDeclaration ?? p.declarations?.[0];
        const pt = decl ? checker.getTypeOfSymbolAtLocation(p, decl) : checker.getTypeOfSymbol(p);
        if (pt.getCallSignatures().length && !(pt.flags & ts.TypeFlags.Union)) continue;
        if (p.flags & ts.SymbolFlags.Method) continue;
        if (p.name.startsWith('__@')) continue; // symbol-keyed (Symbol.iterator, unscopables…)
        properties[p.name] = convert(pt, depth + 1, stack);
        const optional =
          (p.flags & ts.SymbolFlags.Optional) !== 0 ||
          (pt.isUnion() && pt.types.some((t) => t.flags & ts.TypeFlags.Undefined));
        if (!optional) required.push(p.name);
      }
      const idx = checker.getIndexInfosOfType(type)[0];
      const schema: JsonSchema = { type: 'object', properties };
      if (required.length) schema.required = required.sort();
      if (idx) schema.additionalProperties = convert(idx.type, depth + 1, stack);
      return schema;
    } finally {
      stack.delete(type);
    }
  };

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !sf.fileName.endsWith('.controller.ts')) continue;
    ts.forEachChild(sf, (node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      if (!(ts.getDecorators(node) ?? []).some((d) => decoName(d) === 'Controller')) return;
      for (const m of node.members) {
        if (!ts.isMethodDeclaration(m) || !m.name || !ts.isIdentifier(m.name)) continue;
        if (!(ts.getDecorators(m) ?? []).some((d) => HTTP.has(decoName(d) ?? ''))) continue;
        const handler = m.name.text;
        if (usesRawRes(m)) {
          out.push({ controller: node.name.text, handler, schema: null, binary: true });
          continue;
        }
        const sig = checker.getSignatureFromDeclaration(m);
        if (!sig) continue;
        const ret = checker.getAwaitedType(checker.getReturnTypeOfSignature(sig)) ?? checker.getReturnTypeOfSignature(sig);
        const empty = ret.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never);
        out.push({ controller: node.name.text, handler, schema: empty ? null : convert(ret, 0, new Set()) });
      }
    });
  }
  return { handlers: out, components };
}

function dedupe(list: JsonSchema[]): JsonSchema[] {
  const seen = new Map<string, JsonSchema>();
  for (const s of list) seen.set(JSON.stringify(s), s);
  return [...seen.values()];
}

/** Attach schemas to the Nest-generated document (operationId = `${Controller}_${handler}`). */
export function applyResponseSchemas(
  doc: { paths: Record<string, Record<string, { operationId?: string; responses?: Record<string, Record<string, unknown>> }>> },
  handlers: HandlerResponse[],
) {
  const byOp = new Map(handlers.map((h) => [`${h.controller}_${h.handler}`, h]));
  let applied = 0;
  for (const ops of Object.values(doc.paths)) {
    for (const op of Object.values(ops)) {
      const h = op.operationId ? byOp.get(op.operationId) : undefined;
      if (!h || !op.responses) continue;
      const code = Object.keys(op.responses).find((c) => /^2/.test(c)) ?? '200';
      const res = (op.responses[code] ??= { description: '' });
      if (res.content) continue; // explicit @ApiOkResponse wins
      if (h.binary) {
        res.content = { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } };
      } else if (h.schema) {
        const s = h.schema;
        res.content = s.format === 'binary'
          ? { 'application/octet-stream': { schema: s } }
          : { 'application/json': { schema: s } };
      }
      applied++;
    }
  }
  return applied;
}

if (require.main === module) {
  const t = Date.now();
  const { handlers } = collectResponseSchemas();
  const size = JSON.stringify(handlers).length;
  console.log(`${handlers.length} handlers, ${handlers.filter((h) => h.schema).length} with schema, ${handlers.filter((h) => h.binary).length} raw, ${(size / 1024).toFixed(0)} KB, ${Date.now() - t} ms`);
  void join;
}
