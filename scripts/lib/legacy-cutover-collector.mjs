import path from "node:path"
import ts from "typescript"

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"]

export function parseRepositorySource(sourcePath, sourceText) {
  return ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

export function collectJsxRoutePaths(sourcePath, sourceText) {
  const source = parseRepositorySource(sourcePath, sourceText)
  const routes = []
  visit(source, (node) => {
    if (!ts.isJsxSelfClosingElement(node) || node.tagName.getText(source) !== "Route") return
    const pathAttribute = node.attributes.properties.find((attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "path")
    if (!pathAttribute || !ts.isJsxAttribute(pathAttribute)) return
    const value = jsxStaticString(pathAttribute.initializer)
    if (value !== null) routes.push(value)
  })
  return routes
}

export function collectStaticObjectArray(sourcePath, sourceText, variableName) {
  const source = parseRepositorySource(sourcePath, sourceText)
  let result = []
  visit(source, (node) => {
    if (!ts.isVariableDeclaration(node) || node.name.getText(source) !== variableName) return
    const array = unwrapExpression(node.initializer)
    if (!array || !ts.isArrayLiteralExpression(array)) return
    result = array.elements
      .map((element) => staticObject(element, source))
      .filter((value) => value !== null)
  })
  return result
}

export function collectModuleReferences(files, targetPath) {
  const normalizedTarget = normalizePath(targetPath)
  const references = []
  for (const file of files) {
    const source = parseRepositorySource(file.path, file.text)
    visit(source, (node) => {
      let specifier = null
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        specifier = node.moduleSpecifier.text
      } else if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        specifier = node.arguments[0].text
      }
      if (!specifier || !specifier.startsWith(".")) return
      if (resolveModulePath(file.path, specifier) !== normalizedTarget) return
      references.push({ path: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
    })
  }
  return references
}

export function collectPropertyReferences(files, propertyName, excludedPaths = []) {
  const excluded = new Set(excludedPaths.map(normalizePath))
  const references = []
  for (const file of files) {
    if (excluded.has(normalizePath(file.path))) continue
    const source = parseRepositorySource(file.path, file.text)
    visit(source, (node) => {
      const matchesProperty = ts.isPropertyAccessExpression(node) && node.name.text === propertyName
      const matchesElement = ts.isElementAccessExpression(node) &&
        node.argumentExpression &&
        ts.isStringLiteral(node.argumentExpression) &&
        node.argumentExpression.text === propertyName
      if (!matchesProperty && !matchesElement) return
      references.push({ path: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
    })
  }
  return references
}

export function collectNamedObjectPropertyReferences(files, objectName, propertyName, excludedPaths = []) {
  const excluded = new Set(excludedPaths.map(normalizePath))
  const references = []
  for (const file of files) {
    if (excluded.has(normalizePath(file.path))) continue
    const source = parseRepositorySource(file.path, file.text)
    visit(source, (node) => {
      const matches = ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === objectName &&
        node.name.text === propertyName
      if (!matches) return
      references.push({ path: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
    })
  }
  return references
}

export function collectIdentifierReferences(files, identifierName) {
  const references = []
  for (const file of files) {
    const source = parseRepositorySource(file.path, file.text)
    visit(source, (node) => {
      if (!ts.isIdentifier(node) || node.text !== identifierName) return
      references.push({ path: file.path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
    })
  }
  return references
}

export function collectStringLiteralReferences(files, needle) {
  const references = []
  const seen = new Set()
  for (const file of files) {
    const source = parseRepositorySource(file.path, file.text)
    visit(source, (node) => {
      if ((!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) ||
        !node.text.includes(needle)) return
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
      const key = `${file.path}:${line}`
      if (seen.has(key)) return
      seen.add(key)
      references.push({ path: file.path, line })
    })
  }
  return references
}

function staticObject(expression, source) {
  const object = unwrapExpression(expression)
  if (!object || !ts.isObjectLiteralExpression(object)) return null
  const value = {}
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const key = property.name.getText(source).replace(/^['"]|['"]$/gu, "")
    const resolved = staticValue(property.initializer)
    if (resolved !== undefined) value[key] = resolved
  }
  return value
}

function staticValue(expression) {
  const value = unwrapExpression(expression)
  if (!value) return undefined
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text
  if (value.kind === ts.SyntaxKind.NullKeyword) return null
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isArrayLiteralExpression(value)) {
    const values = value.elements.map(staticValue)
    return values.some((item) => item === undefined) ? undefined : values
  }
  return undefined
}

function unwrapExpression(expression) {
  let current = expression
  while (current && (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  )) current = current.expression
  return current
}

function jsxStaticString(initializer) {
  if (!initializer) return null
  if (ts.isStringLiteral(initializer)) return initializer.text
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return null
  const expression = unwrapExpression(initializer.expression)
  return expression && ts.isStringLiteral(expression) ? expression.text : null
}

function resolveModulePath(importerPath, specifier) {
  const unresolved = normalizePath(path.posix.join(path.posix.dirname(importerPath), specifier))
  const extension = SOURCE_EXTENSIONS.find((candidate) => unresolved.endsWith(candidate))
  return extension ? unresolved : `${unresolved}.tsx`
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/\/\.\//gu, "/")
}

function visit(node, callback) {
  callback(node)
  node.forEachChild((child) => visit(child, callback))
}
