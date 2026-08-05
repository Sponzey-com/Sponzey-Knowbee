import ts from "typescript"

function parseSource(source: string): ts.SourceFile {
  return ts.createSourceFile("contract.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function declaredName(node: ts.FunctionDeclaration | ts.MethodDeclaration): string | undefined {
  return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined
}

function calledName(expression: ts.LeftHandSideExpression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return undefined
}

export function functionParameterTypes(source: string, functionName: string): string[][] {
  const file = parseSource(source)
  const matches: string[][] = []
  const visit = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
      && declaredName(node) === functionName
    ) {
      matches.push(node.parameters.map((parameter) => parameter.type?.getText(file) ?? "unknown"))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return matches
}

export function callArgumentCounts(source: string, functionName: string): number[] {
  const file = parseSource(source)
  const counts: number[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calledName(node.expression) === functionName) {
      counts.push(node.arguments.length)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return counts
}

export function callArgumentTexts(source: string, functionName: string): string[][] {
  const file = parseSource(source)
  const calls: string[][] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calledName(node.expression) === functionName) {
      calls.push(node.arguments.map((argument) => argument.getText(file)))
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return calls
}

export function interfacePropertyTypes(source: string, interfaceName: string): Record<string, string> {
  const file = parseSource(source)
  const properties: Record<string, string> = {}
  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      for (const member of node.members) {
        if (!ts.isPropertySignature(member) || !member.name || !member.type) continue
        properties[member.name.getText(file)] = member.type.getText(file)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return properties
}

export function callObjectPropertyInitializers(
  source: string,
  functionName: string,
): Array<Record<string, string>> {
  const file = parseSource(source)
  const calls: Array<Record<string, string>> = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && calledName(node.expression) === functionName) {
      const first = node.arguments[0]
      if (first && ts.isObjectLiteralExpression(first)) {
        const properties: Record<string, string> = {}
        for (const property of first.properties) {
          if (ts.isPropertyAssignment(property)) {
            properties[property.name.getText(file)] = property.initializer.getText(file)
          } else if (ts.isShorthandPropertyAssignment(property)) {
            properties[property.name.text] = property.name.text
          }
        }
        calls.push(properties)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return calls
}

export function legacyConfigAccesses(source: string): string[] {
  const file = parseSource(source)
  const accesses = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node) && ["getConfig", "reloadConfig"].includes(node.name.text)) {
      accesses.add(`import:${node.name.text}`)
    }
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && ["getConfig", "reloadConfig"].includes(node.expression.text)
    ) {
      accesses.add(`call:${node.expression.text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return [...accesses].sort()
}
