import { readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { collectPathPortabilitySourceFiles } from "./check-path-portability.mjs";

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const ignoredTestDirectories = new Set(["__specs__", "__tests__", "spec", "specs", "test", "tests"]);
const testFilePattern = /\.(?:spec|test)\.[^\\/]+$/i;
const allowMarker = "command-portability-allow:";
const childProcessModules = new Set(["child_process", "node:child_process"]);
const childProcessMethods = new Set([
  "exec",
  "execFile",
  "execFileSync",
  "execSync",
  "spawn",
  "spawnSync",
]);
const injectedMethodNames = new Map([
  ["execFileAsync", "execFile"],
  ["execFileFn", "execFile"],
  ["execFileSyncFn", "execFileSync"],
  ["execFn", "exec"],
  ["execSyncFn", "execSync"],
  ["spawnFn", "spawn"],
  ["spawnSyncFn", "spawnSync"],
]);
const regexPrefixKeywords = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);
const expressionEndPunctuators = new Set([")", "]", "}", "++", "--"]);
const regexAfterControlHeaderKeywords = new Set(["for", "if", "while", "with"]);
const multiCharacterPunctuators = [
  "...",
  "===",
  "!==",
  "=>",
  "&&",
  "||",
  "??",
  "==",
  "!=",
  "<=",
  ">=",
  "++",
  "--",
  "**",
  "?.",
];

function tokenizeSource(source) {
  const tokens = [];
  const comments = [];
  let index = 0;
  let line = 1;

  const pushToken = (type, value, start, startLine) => {
    const token = { line: startLine, start, type, value };
    tokens.push(token);
    return token;
  };

  const readLineComment = () => {
    const start = index;
    const startLine = line;
    index += 2;
    while (index < source.length && source[index] !== "\n") {
      index += 1;
    }
    comments.push({ line: startLine, value: source.slice(start, index) });
  };

  const readBlockComment = () => {
    const start = index;
    const startLine = line;
    index += 2;
    while (index < source.length) {
      if (source[index] === "\n") {
        line += 1;
      }
      if (source[index] === "*" && source[index + 1] === "/") {
        index += 2;
        comments.push({ line: startLine, value: source.slice(start, index) });
        return;
      }
      index += 1;
    }
    comments.push({ line: startLine, value: source.slice(start) });
  };

  const readQuotedString = (quote) => {
    const start = index;
    const startLine = line;
    let value = "";
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        value += character;
        index += 1;
        if (index < source.length) {
          if (source[index] === "\n") {
            line += 1;
          }
          value += source[index];
          index += 1;
        }
        continue;
      }
      if (character === quote) {
        index += 1;
        pushToken("string", value, start, startLine);
        return;
      }
      if (character === "\n") {
        line += 1;
      }
      value += character;
      index += 1;
    }
    pushToken("string", value, start, startLine);
  };

  const canStartRegex = (contextStart) => {
    if (tokens.length === contextStart) {
      return true;
    }
    const previous = tokens.at(-1);
    if (previous.type === "identifier") {
      return regexPrefixKeywords.has(previous.value);
    }
    if (previous.type === "punctuator") {
      if (previous.value === ")") {
        const closeIndex = tokens.length - 1;
        const openIndex = findOpeningToken(tokens, closeIndex, "(", ")");
        return (
          openIndex >= contextStart &&
          regexAfterControlHeaderKeywords.has(tokens[openIndex - 1]?.value)
        );
      }
      if (previous.value === "}") {
        const closeIndex = tokens.length - 1;
        const openIndex = findOpeningToken(tokens, closeIndex, "{", "}");
        const beforeBlock = tokens[openIndex - 1];
        return (
          openIndex >= contextStart &&
          (openIndex === contextStart ||
            beforeBlock?.value === ")" ||
            [";", "=>", "}"].includes(beforeBlock?.value) ||
            ["do", "else", "finally", "try"].includes(beforeBlock?.value))
        );
      }
      return !expressionEndPunctuators.has(previous.value);
    }
    return false;
  };

  const readRegex = (contextStart) => {
    if (!canStartRegex(contextStart)) {
      return false;
    }
    const start = index;
    const startLine = line;
    let cursor = index + 1;
    let inCharacterClass = false;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === "\n" || character === "\r") {
        return false;
      }
      if (character === "\\") {
        cursor += 2;
        continue;
      }
      if (character === "[") {
        inCharacterClass = true;
      } else if (character === "]") {
        inCharacterClass = false;
      } else if (character === "/" && !inCharacterClass) {
        cursor += 1;
        while (cursor < source.length && /[A-Za-z]/.test(source[cursor])) {
          cursor += 1;
        }
        index = cursor;
        pushToken("regex", source.slice(start, cursor), start, startLine);
        return true;
      }
      cursor += 1;
    }
    return false;
  };

  const scanCode = (stopAtTemplateExpressionEnd = false) => {
    const contextStart = tokens.length;
    let expressionBraceDepth = 0;

    const readTemplate = () => {
      const start = index;
      const startLine = line;
      let hasInterpolation = false;
      const templateToken = pushToken("template", "", start, startLine);
      index += 1;
      while (index < source.length) {
        const character = source[index];
        if (character === "\\") {
          templateToken.value += character;
          index += 1;
          if (index < source.length) {
            if (source[index] === "\n") {
              line += 1;
            }
            templateToken.value += source[index];
            index += 1;
          }
          continue;
        }
        if (character === "`") {
          index += 1;
          templateToken.type = hasInterpolation ? "template" : "string";
          return;
        }
        if (character === "$" && source[index + 1] === "{") {
          hasInterpolation = true;
          templateToken.value += "__dynamic__";
          index += 2;
          scanCode(true);
          continue;
        }
        if (character === "\n") {
          line += 1;
        }
        templateToken.value += character;
        index += 1;
      }
    };

    while (index < source.length) {
      const character = source[index];
      const next = source[index + 1];

      if (stopAtTemplateExpressionEnd && character === "}" && expressionBraceDepth === 0) {
        index += 1;
        return;
      }
      if (/\s/.test(character)) {
        if (character === "\n") {
          line += 1;
        }
        index += 1;
        continue;
      }
      if (character === "/" && next === "/") {
        readLineComment();
        continue;
      }
      if (character === "/" && next === "*") {
        readBlockComment();
        continue;
      }
      if (character === "'" || character === '"') {
        readQuotedString(character);
        continue;
      }
      if (character === "`") {
        readTemplate();
        continue;
      }
      if (character === "/" && readRegex(contextStart)) {
        continue;
      }
      if (/[A-Za-z_$]/.test(character)) {
        const start = index;
        const startLine = line;
        index += 1;
        while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) {
          index += 1;
        }
        pushToken("identifier", source.slice(start, index), start, startLine);
        continue;
      }
      if (/[0-9]/.test(character)) {
        const start = index;
        const startLine = line;
        index += 1;
        while (index < source.length && /[A-Za-z0-9_.]/.test(source[index])) {
          index += 1;
        }
        pushToken("number", source.slice(start, index), start, startLine);
        continue;
      }

      const punctuator = multiCharacterPunctuators.find((candidate) =>
        source.startsWith(candidate, index),
      ) ?? character;
      pushToken("punctuator", punctuator, index, line);
      index += punctuator.length;
      if (stopAtTemplateExpressionEnd) {
        if (punctuator === "{") {
          expressionBraceDepth += 1;
        } else if (punctuator === "}") {
          expressionBraceDepth -= 1;
        }
      }
    }
  };

  scanCode();
  return { comments, tokens };
}

function parseNamedBindings(tokens, start, end, separator) {
  const bindings = new Map();
  for (let index = start; index < end; index += 1) {
    const source = tokens[index];
    if (source?.type !== "identifier" || !childProcessMethods.has(source.value)) {
      continue;
    }
    const hasAlias = tokens[index + 1]?.value === separator && tokens[index + 2]?.type === "identifier";
    const local = hasAlias ? tokens[index + 2].value : source.value;
    bindings.set(local, source.value);
    if (hasAlias) {
      index += 2;
    }
  }
  return bindings;
}

function findOpeningToken(tokens, closeIndex, opening, closing) {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    if (tokens[index].value === closing) {
      depth += 1;
    } else if (tokens[index].value === opening) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function resolveChildProcessBindings(tokens) {
  const direct = new Map();
  const namespaces = new Set();
  let referencesChildProcess = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "identifier") {
      continue;
    }

    if (token.value === "import" && tokens[index + 1]?.value !== "(") {
      let fromIndex = -1;
      for (let cursor = index + 1; cursor < tokens.length && tokens[cursor].value !== ";"; cursor += 1) {
        if (tokens[cursor].value === "from") {
          fromIndex = cursor;
          break;
        }
      }
      if (!childProcessModules.has(tokens[fromIndex + 1]?.value)) {
        continue;
      }
      referencesChildProcess = true;
      if (
        tokens[index + 1]?.value === "*" &&
        tokens[index + 2]?.value === "as" &&
        tokens[index + 3]?.type === "identifier"
      ) {
        namespaces.add(tokens[index + 3].value);
      }
      const openBrace = tokens.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && candidateIndex < fromIndex && candidate.value === "{",
      );
      if (openBrace !== -1) {
        const closeBrace = tokens.findIndex(
          (candidate, candidateIndex) =>
            candidateIndex > openBrace && candidateIndex < fromIndex && candidate.value === "}",
        );
        for (const [local, source] of parseNamedBindings(tokens, openBrace + 1, closeBrace, "as")) {
          direct.set(local, source);
        }
      }
      continue;
    }

    const moduleCloseIndex = childProcessModuleCloseIndex(tokens, index);
    if (moduleCloseIndex === -1) {
      continue;
    }
    referencesChildProcess = true;
    if (tokens[index - 1]?.value !== "=") {
      continue;
    }
    if (tokens[index - 2]?.type === "identifier") {
      const assignedMethod =
        tokens[moduleCloseIndex + 1]?.value === "." &&
        childProcessMethods.has(tokens[moduleCloseIndex + 2]?.value)
          ? tokens[moduleCloseIndex + 2].value
          : null;
      if (assignedMethod) {
        direct.set(tokens[index - 2].value, assignedMethod);
      } else {
        namespaces.add(tokens[index - 2].value);
      }
    } else if (tokens[index - 2]?.value === "}") {
      const openBrace = findOpeningToken(tokens, index - 2, "{", "}");
      for (const [local, source] of parseNamedBindings(tokens, openBrace + 1, index - 2, ":")) {
        direct.set(local, source);
      }
    }
  }

  return { direct, namespaces, referencesChildProcess };
}

function findClosingToken(tokens, openIndex, opening, closing) {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === opening) {
      depth += 1;
    } else if (tokens[index].value === closing) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function childProcessModuleCloseIndex(tokens, index) {
  if (
    !["import", "require"].includes(tokens[index]?.value) ||
    tokens[index + 1]?.value !== "(" ||
    tokens[index + 2]?.type !== "string" ||
    !childProcessModules.has(tokens[index + 2].value)
  ) {
    return -1;
  }
  const closeIndex = tokens[index + 3]?.value === "," ? index + 4 : index + 3;
  return tokens[closeIndex]?.value === ")" ? closeIndex : -1;
}

function resolveCallAt(tokens, index, bindings) {
  const token = tokens[index];
  if (token?.type !== "identifier") {
    return null;
  }
  const moduleCloseIndex = childProcessModuleCloseIndex(tokens, index);
  if (
    moduleCloseIndex !== -1 &&
    tokens[moduleCloseIndex + 1]?.value === "." &&
    childProcessMethods.has(tokens[moduleCloseIndex + 2]?.value) &&
    tokens[moduleCloseIndex + 3]?.value === "("
  ) {
    return {
      method: tokens[moduleCloseIndex + 2].value,
      openIndex: moduleCloseIndex + 3,
    };
  }
  const directMethod = bindings.direct.get(token.value) ?? injectedMethodNames.get(token.value);
  const directOpenIndex =
    tokens[index + 1]?.value === "("
      ? index + 1
      : tokens[index + 1]?.value === "?." && tokens[index + 2]?.value === "("
        ? index + 2
        : -1;
  if (
    directMethod &&
    directOpenIndex !== -1 &&
    tokens[index - 1]?.value !== "." &&
    tokens[index - 1]?.value !== "?."
  ) {
    return { method: directMethod, openIndex: directOpenIndex };
  }
  const namespaceSeparator = tokens[index + 1]?.value;
  const namespaceMethod = tokens[index + 2]?.value;
  const namespaceOpenIndex =
    tokens[index + 3]?.value === "("
      ? index + 3
      : tokens[index + 3]?.value === "?." && tokens[index + 4]?.value === "("
        ? index + 4
        : -1;
  if (
    bindings.namespaces.has(token.value) &&
    (namespaceSeparator === "." || namespaceSeparator === "?.") &&
    childProcessMethods.has(namespaceMethod) &&
    namespaceOpenIndex !== -1
  ) {
    return { method: namespaceMethod, openIndex: namespaceOpenIndex };
  }
  return null;
}

function findChildProcessCalls(tokens, bindings) {
  const calls = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const call = resolveCallAt(tokens, index, bindings);
    if (!call) {
      continue;
    }
    const closeIndex = findClosingToken(tokens, call.openIndex, "(", ")");
    if (closeIndex !== -1) {
      calls.push({ ...call, closeIndex });
    }
  }
  return calls;
}

function findTopLevelArguments(tokens, openIndex, closeIndex) {
  const argumentsList = [];
  let start = openIndex + 1;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  for (let index = start; index < closeIndex; index += 1) {
    const value = tokens[index].value;
    if (value === "{") braceDepth += 1;
    else if (value === "}") braceDepth -= 1;
    else if (value === "[") bracketDepth += 1;
    else if (value === "]") bracketDepth -= 1;
    else if (value === "(") parenthesisDepth += 1;
    else if (value === ")") parenthesisDepth -= 1;
    else if (value === "," && braceDepth === 0 && bracketDepth === 0 && parenthesisDepth === 0) {
      argumentsList.push({ end: index, start });
      start = index + 1;
    }
  }
  if (start < closeIndex) {
    argumentsList.push({ end: closeIndex, start });
  }
  return argumentsList;
}

function unwrapParenthesizedArgument(tokens, argument) {
  let start = argument.start;
  let end = argument.end;
  while (tokens[start]?.value === "(") {
    const closeIndex = findClosingToken(tokens, start, "(", ")");
    if (closeIndex !== end - 1) {
      break;
    }
    start += 1;
    end = closeIndex;
  }
  return { end, start };
}

function executablePackageManager(value) {
  const basename = value.trim().split(/[\\/]+/).filter(Boolean).at(-1)?.toLowerCase();
  return /^(?:npm|npx)(?:\.cmd|\.bat)?$/i.test(basename ?? "") ? basename : null;
}

function shellCommandExecutables(value) {
  const source = value.replaceAll('\\"', '"').replaceAll("\\'", "'");
  const executables = [];
  let commandStart = true;
  let index = 0;
  let quote = null;

  const isSeparator = (cursor) =>
    source[cursor] === ";" ||
    source[cursor] === "\n" ||
    source[cursor] === "\r" ||
    source[cursor] === "|" ||
    source[cursor] === "&";

  while (index < source.length) {
    if (!commandStart) {
      const character = source[index];
      if (quote) {
        if (character === quote && source[index - 1] !== "\\") {
          quote = null;
        }
        index += 1;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        index += 1;
        continue;
      }
      if (isSeparator(index)) {
        index += source.startsWith("&&", index) || source.startsWith("||", index) ? 2 : 1;
        commandStart = true;
        continue;
      }
      index += 1;
      continue;
    }

    while (index < source.length && /[\t ]/.test(source[index])) {
      index += 1;
    }
    if (isSeparator(index)) {
      index += source.startsWith("&&", index) || source.startsWith("||", index) ? 2 : 1;
      continue;
    }
    if (index >= source.length) {
      break;
    }

    let word = "";
    quote = null;
    while (index < source.length) {
      const character = source[index];
      if (quote) {
        if (character === quote && source[index - 1] !== "\\") {
          quote = null;
        } else {
          word += character;
        }
        index += 1;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        index += 1;
        continue;
      }
      if (/\s/.test(character) || isSeparator(index)) {
        break;
      }
      word += character;
      index += 1;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      continue;
    }
    if (word) {
      executables.push(word);
    }
    commandStart = false;
  }
  return executables;
}

function commandPackageManager(method, value) {
  if (method === "exec" || method === "execSync") {
    for (const executable of shellCommandExecutables(value)) {
      const packageManager = executablePackageManager(executable);
      if (packageManager) {
        return packageManager;
      }
    }
    return null;
  }
  return executablePackageManager(value);
}

function allowedLinesFromComments(comments) {
  const lines = new Set();
  for (const comment of comments) {
    for (const [offset, sourceLine] of comment.value.split(/\r?\n/).entries()) {
      const markerIndex = sourceLine.indexOf(allowMarker);
      if (markerIndex !== -1 && sourceLine.slice(markerIndex + allowMarker.length).trim()) {
        lines.add(comment.line + offset);
      }
    }
  }
  return lines;
}

function shellPropertyAt(tokens, index) {
  const token = tokens[index];
  if (
    (token?.type === "identifier" || token?.type === "string") &&
    token.value === "shell" &&
    tokens[index + 1]?.value === ":"
  ) {
    return { colonIndex: index + 1, line: token.line };
  }
  if (
    token?.type === "string" &&
    token.value === "shell" &&
    tokens[index - 1]?.value === "[" &&
    tokens[index + 1]?.value === "]" &&
    tokens[index + 2]?.value === ":"
  ) {
    return { colonIndex: index + 2, line: token.line };
  }
  return null;
}

function inspectInlineOptions(tokens, argument, allowedLines, file) {
  const issues = [];
  if (tokens[argument.start]?.value !== "{") {
    return issues;
  }
  const closeIndex = findClosingToken(tokens, argument.start, "{", "}");
  if (closeIndex === -1 || closeIndex >= argument.end) {
    return issues;
  }

  let braceDepth = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  const spreads = [];
  const literalFalseShells = [];
  for (let index = argument.start; index <= closeIndex; index += 1) {
    const value = tokens[index].value;
    if (value === "{") braceDepth += 1;
    else if (value === "}") braceDepth -= 1;
    else if (value === "[") bracketDepth += 1;
    else if (value === "]") bracketDepth -= 1;
    else if (value === "(") parenthesisDepth += 1;
    else if (value === ")") parenthesisDepth -= 1;

    const computedShell =
      tokens[index]?.type === "string" &&
      tokens[index].value === "shell" &&
      tokens[index - 1]?.value === "[" &&
      tokens[index + 1]?.value === "]";
    const topLevelProperty =
      braceDepth === 1 &&
      parenthesisDepth === 0 &&
      (bracketDepth === 0 || (computedShell && bracketDepth === 1));
    if (!topLevelProperty) {
      continue;
    }
    if (value === "..." && bracketDepth === 0) {
      spreads.push(index);
      continue;
    }
    const property = shellPropertyAt(tokens, index);
    if (!property) {
      if (
        tokens[index]?.type === "identifier" &&
        value === "shell" &&
        ["(", ",", "}"].includes(tokens[index + 1]?.value) &&
        !allowedLines.has(tokens[index].line)
      ) {
        issues.push({
          file,
          label: "child-process shell option must be the literal false",
          line: tokens[index].line,
        });
      }
      continue;
    }
    const valueToken = tokens[property.colonIndex + 1];
    const delimiter = tokens[property.colonIndex + 2]?.value;
    const isLiteralFalse = valueToken?.type === "identifier" && valueToken.value === "false" && [",", "}"].includes(delimiter);
    if (isLiteralFalse) {
      literalFalseShells.push(index);
    } else if (!allowedLines.has(property.line)) {
      issues.push({
        file,
        label: "child-process shell option must be the literal false",
        line: property.line,
      });
    }
  }

  const lastSpread = spreads.at(-1);
  if (
    lastSpread !== undefined &&
    !literalFalseShells.some((shellIndex) => shellIndex > lastSpread) &&
    !allowedLines.has(tokens[lastSpread].line)
  ) {
    issues.push({
      file,
      label: "child-process options spread must be followed by shell: false",
      line: tokens[lastSpread].line,
    });
  }
  return issues;
}

export function findCommandPortabilityIssues(source, file = "<source>") {
  const { comments, tokens } = tokenizeSource(source);
  const bindings = resolveChildProcessBindings(tokens);
  if (!bindings.referencesChildProcess) {
    return [];
  }
  const allowedLines = allowedLinesFromComments(comments);
  const issues = [];

  for (const call of findChildProcessCalls(tokens, bindings)) {
    const argumentsList = findTopLevelArguments(tokens, call.openIndex, call.closeIndex).map(
      (argument) => unwrapParenthesizedArgument(tokens, argument),
    );
    const command = tokens[argumentsList[0]?.start];
    if (command?.type === "string" || command?.type === "template") {
      const packageManager = commandPackageManager(call.method, command.value);
      if (packageManager && !allowedLines.has(command.line)) {
        issues.push({
          file,
          label: `launch ${packageManager} through Node and its JavaScript CLI instead of a platform shell shim`,
          line: command.line,
        });
      }
    }
    for (const argument of argumentsList.slice(1)) {
      issues.push(...inspectInlineOptions(tokens, argument, allowedLines, file));
    }
  }

  return issues.sort((left, right) => left.line - right.line || left.label.localeCompare(right.label));
}

function isTestSourceFile(file) {
  const parts = file.split(/[\\/]+/);
  const basename = parts.at(-1) ?? "";
  return testFilePattern.test(basename) || parts.slice(0, -1).some((part) =>
    ignoredTestDirectories.has(part.toLowerCase()),
  );
}

export function collectCommandPortabilitySourceFiles(repoRoot = resolve(".")) {
  const resolvedRoot = resolve(repoRoot);
  return collectPathPortabilitySourceFiles(resolvedRoot).filter((file) =>
    sourceExtensions.has(extname(file)) && !isTestSourceFile(relative(resolvedRoot, file)),
  );
}

export function analyzeCommandPortability(options = {}) {
  const sourceFiles = options.sourceFiles ?? collectCommandPortabilitySourceFiles(options.repoRoot);
  const childProcessFiles = [];
  const issues = [];
  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const bindings = resolveChildProcessBindings(tokenizeSource(source).tokens);
    if (!bindings.referencesChildProcess) {
      continue;
    }
    childProcessFiles.push(sourceFile);
    issues.push(...findCommandPortabilityIssues(source, sourceFile));
  }
  return { childProcessFiles, issues, sourceFiles };
}

function displayPath(file) {
  const path = relative(resolve("."), file);
  return path && !path.startsWith("..") ? path : file;
}

function runCli() {
  const { childProcessFiles, issues, sourceFiles } = analyzeCommandPortability();
  if (issues.length > 0) {
    console.error("Command portability contract failed:");
    for (const issue of issues) {
      console.error(`  - ${displayPath(issue.file)}:${issue.line}: ${issue.label}`);
    }
    console.error(
      "Use process.execPath with a local JavaScript CLI and literal shell: false, or add a documented command-portability-allow comment for an intentional exception.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Command portability contract ok (${sourceFiles.length} production source files checked, ${childProcessFiles.length} child-process files analyzed).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
