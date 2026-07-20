import { readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { collectPathPortabilitySourceFiles } from "./check-path-portability.mjs";

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const allowMarker = "command-portability-allow:";
const childProcessModules = new Set(["child_process", "node:child_process"]);
const utilModules = new Set(["node:util", "util"]);
const childProcessMethods = new Set([
  "exec",
  "execFile",
  "execFileSync",
  "execSync",
  "spawn",
  "spawnSync",
]);
const promisifyMembers = new Set(["promisify"]);
const platformShellExecutables = new Set([
  "bash",
  "bash.exe",
  "cmd",
  "cmd.exe",
  "dash",
  "dash.exe",
  "fish",
  "fish.exe",
  "ksh",
  "ksh.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "sh.exe",
  "zsh",
  "zsh.exe",
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
const aliasDeclarationKeywords = new Set([
  "as",
  "class",
  "const",
  "function",
  "import",
  "let",
  "var",
]);
const aliasContinuationKeywords = new Set(["as", "in", "instanceof", "satisfies"]);
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
    let sourceMethod = null;
    let separatorIndex = index + 1;
    if (
      tokens[index]?.type === "identifier" &&
      childProcessMethods.has(tokens[index].value)
    ) {
      sourceMethod = tokens[index].value;
    } else if (
      tokens[index]?.value === "[" &&
      tokens[index + 1]?.type === "string" &&
      childProcessMethods.has(tokens[index + 1].value) &&
      tokens[index + 2]?.value === "]"
    ) {
      sourceMethod = tokens[index + 1].value;
      separatorIndex = index + 3;
    }
    if (!sourceMethod) {
      continue;
    }
    const hasAlias =
      tokens[separatorIndex]?.value === separator &&
      tokens[separatorIndex + 1]?.type === "identifier";
    const local = hasAlias ? tokens[separatorIndex + 1].value : sourceMethod;
    bindings.set(local, sourceMethod);
    if (hasAlias) {
      index = separatorIndex + 1;
    }
  }
  return bindings;
}

function parsePromisifyBindings(tokens, start, end, separator) {
  const bindings = new Set();
  for (let index = start; index < end; index += 1) {
    if (tokens[index]?.type !== "identifier" || tokens[index].value !== "promisify") {
      continue;
    }
    const hasAlias =
      tokens[index + 1]?.value === separator &&
      tokens[index + 2]?.type === "identifier";
    bindings.add(hasAlias ? tokens[index + 2].value : "promisify");
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
  const propagationDirect = new Map();
  const topLevelTokenIndexes = findTopLevelTokenIndexes(tokens);
  let referencesChildProcess = false;

  const recordPropagationDirect = (name, method, availableFrom = 0) => {
    if (!propagationDirect.has(name)) {
      propagationDirect.set(name, { availableFrom, method });
    }
  };

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
          recordPropagationDirect(local, source);
        }
      }
      continue;
    }

    if (
      namespaces.has(token.value) &&
      tokens[index - 1]?.value === "="
    ) {
      if (tokens[index - 2]?.type === "identifier") {
        const member = staticChildProcessMemberAt(tokens, index);
        if (member) {
          direct.set(tokens[index - 2].value, member.method);
          if (
            tokens[index - 3]?.value === "const" &&
            topLevelTokenIndexes.has(index - 3)
          ) {
            recordPropagationDirect(
              tokens[index - 2].value,
              member.method,
              member.nextIndex,
            );
          }
        }
      } else if (tokens[index - 2]?.value === "}") {
        const openBrace = findOpeningToken(tokens, index - 2, "{", "}");
        for (const [local, source] of parseNamedBindings(
          tokens,
          openBrace + 1,
          index - 2,
          ":",
        )) {
          direct.set(local, source);
          if (
            tokens[openBrace - 1]?.value === "const" &&
            topLevelTokenIndexes.has(openBrace - 1)
          ) {
            recordPropagationDirect(local, source, index + 1);
          }
        }
      }
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
      const assignedMember = staticChildProcessMemberAt(tokens, moduleCloseIndex);
      if (assignedMember) {
        direct.set(tokens[index - 2].value, assignedMember.method);
        if (
          tokens[index - 3]?.value === "const" &&
          topLevelTokenIndexes.has(index - 3)
        ) {
          recordPropagationDirect(
            tokens[index - 2].value,
            assignedMember.method,
            assignedMember.nextIndex,
          );
        }
      } else {
        namespaces.add(tokens[index - 2].value);
      }
    } else if (tokens[index - 2]?.value === "}") {
      const openBrace = findOpeningToken(tokens, index - 2, "{", "}");
      for (const [local, source] of parseNamedBindings(tokens, openBrace + 1, index - 2, ":")) {
        direct.set(local, source);
        if (
          tokens[openBrace - 1]?.value === "const" &&
          topLevelTokenIndexes.has(openBrace - 1)
        ) {
          recordPropagationDirect(local, source, moduleCloseIndex + 1);
        }
      }
    }
  }

  const bindings = {
    aliases: new Map(),
    direct,
    namespaces,
    propagationDirect,
    promisifiedAvailableFrom: new Map(),
  };
  const promisifyBindings = resolvePromisifyBindings(tokens);
  const promisifiedArgumentIndexes = findPromisifiedArgumentIndexes(
    tokens,
    promisifyBindings,
  );
  for (let pass = 0; pass <= tokens.length; pass += 1) {
    const aliasesChanged = propagateImmutableChildProcessAliases(
      tokens,
      bindings,
      promisifiedArgumentIndexes,
      topLevelTokenIndexes,
    );
    const promisifiedChanged = propagatePromisifiedChildProcessBindings(
      tokens,
      bindings,
      promisifyBindings,
      topLevelTokenIndexes,
    );
    if (!aliasesChanged && !promisifiedChanged) {
      break;
    }
  }
  return { ...bindings, referencesChildProcess };
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

function moduleCloseIndex(tokens, index, modules) {
  if (
    !["import", "require"].includes(tokens[index]?.value) ||
    tokens[index + 1]?.value !== "(" ||
    tokens[index + 2]?.type !== "string" ||
    !modules.has(tokens[index + 2].value)
  ) {
    return -1;
  }
  const closeIndex = tokens[index + 3]?.value === "," ? index + 4 : index + 3;
  return tokens[closeIndex]?.value === ")" ? closeIndex : -1;
}

function childProcessModuleCloseIndex(tokens, index) {
  return moduleCloseIndex(tokens, index, childProcessModules);
}

function utilModuleCloseIndex(tokens, index) {
  return moduleCloseIndex(tokens, index, utilModules);
}

function staticMemberAt(tokens, baseEndIndex, allowedMembers) {
  const separator = tokens[baseEndIndex + 1]?.value;
  if (
    (separator === "." || separator === "?.") &&
    tokens[baseEndIndex + 2]?.type === "identifier" &&
    allowedMembers.has(tokens[baseEndIndex + 2].value)
  ) {
    return {
      method: tokens[baseEndIndex + 2].value,
      nextIndex: baseEndIndex + 3,
    };
  }

  const bracketIndex = separator === "?." ? baseEndIndex + 2 : baseEndIndex + 1;
  if (
    tokens[bracketIndex]?.value === "[" &&
    tokens[bracketIndex + 1]?.type === "string" &&
    allowedMembers.has(tokens[bracketIndex + 1].value) &&
    tokens[bracketIndex + 2]?.value === "]"
  ) {
    return {
      method: tokens[bracketIndex + 1].value,
      nextIndex: bracketIndex + 3,
    };
  }
  return null;
}

function staticChildProcessMemberAt(tokens, baseEndIndex) {
  return staticMemberAt(tokens, baseEndIndex, childProcessMethods);
}

function callOpenIndexAt(tokens, index) {
  if (tokens[index]?.value === "(") {
    return index;
  }
  return tokens[index]?.value === "?." && tokens[index + 1]?.value === "("
    ? index + 1
    : -1;
}

function resolvePromisifyBindings(tokens) {
  const direct = new Set();
  const namespaces = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.type !== "identifier") {
      continue;
    }

    if (token.value === "import" && tokens[index + 1]?.value !== "(") {
      let fromIndex = -1;
      for (
        let cursor = index + 1;
        cursor < tokens.length && tokens[cursor].value !== ";";
        cursor += 1
      ) {
        if (tokens[cursor].value === "from") {
          fromIndex = cursor;
          break;
        }
      }
      if (!utilModules.has(tokens[fromIndex + 1]?.value)) {
        continue;
      }
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
            candidateIndex > openBrace &&
            candidateIndex < fromIndex &&
            candidate.value === "}",
        );
        for (const local of parsePromisifyBindings(
          tokens,
          openBrace + 1,
          closeBrace,
          "as",
        )) {
          direct.add(local);
        }
      }
      continue;
    }

    const moduleCloseIndex = utilModuleCloseIndex(tokens, index);
    if (moduleCloseIndex === -1 || tokens[index - 1]?.value !== "=") {
      continue;
    }
    if (tokens[index - 2]?.type === "identifier") {
      const member = staticMemberAt(tokens, moduleCloseIndex, promisifyMembers);
      if (member) {
        direct.add(tokens[index - 2].value);
      } else {
        namespaces.add(tokens[index - 2].value);
      }
    } else if (tokens[index - 2]?.value === "}") {
      const openBrace = findOpeningToken(tokens, index - 2, "{", "}");
      for (const local of parsePromisifyBindings(
        tokens,
        openBrace + 1,
        index - 2,
        ":",
      )) {
        direct.add(local);
      }
    }
  }

  return { direct, namespaces };
}

function promisifyCallOpenIndexAt(tokens, index, bindings) {
  const token = tokens[index];
  if (token?.type !== "identifier") {
    return -1;
  }
  if (bindings.direct.has(token.value)) {
    return callOpenIndexAt(tokens, index + 1);
  }
  if (bindings.namespaces.has(token.value)) {
    const member = staticMemberAt(tokens, index, promisifyMembers);
    return member ? callOpenIndexAt(tokens, member.nextIndex) : -1;
  }
  const moduleCloseIndex = utilModuleCloseIndex(tokens, index);
  const member =
    moduleCloseIndex === -1
      ? null
      : staticMemberAt(tokens, moduleCloseIndex, promisifyMembers);
  return member ? callOpenIndexAt(tokens, member.nextIndex) : -1;
}

function findPromisifiedArgumentIndexes(tokens, bindings) {
  const indexes = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const openIndex = promisifyCallOpenIndexAt(tokens, index, bindings);
    if (openIndex !== -1) {
      indexes.add(openIndex + 1);
    }
  }
  return indexes;
}

function immutableAliasMethodReferenceAt(tokens, index, bindings) {
  const token = tokens[index];
  if (token?.type !== "identifier") {
    return null;
  }
  const alias = bindings.aliases.get(token.value);
  if (alias && alias.availableFrom <= index) {
    return alias.method;
  }
  const direct = bindings.propagationDirect.get(token.value);
  if (direct && direct.availableFrom <= index) {
    return direct.method;
  }
  if (bindings.namespaces.has(token.value)) {
    return staticChildProcessMemberAt(tokens, index)?.method ?? null;
  }
  const moduleCloseIndex = childProcessModuleCloseIndex(tokens, index);
  return moduleCloseIndex === -1
    ? null
    : staticChildProcessMemberAt(tokens, moduleCloseIndex)?.method ?? null;
}

function promisifiedMethodReferenceAt(tokens, index, bindings) {
  const token = tokens[index];
  if (token?.type !== "identifier") {
    return null;
  }
  const alias = bindings.aliases.get(token.value);
  if (alias) {
    return alias.availableFrom <= index ? alias.method : null;
  }
  if ((bindings.promisifiedAvailableFrom.get(token.value) ?? 0) > index) {
    return null;
  }
  const directMethod = bindings.direct.get(token.value);
  if (directMethod) {
    return directMethod;
  }
  if (bindings.namespaces.has(token.value)) {
    return staticChildProcessMemberAt(tokens, index)?.method ?? null;
  }
  const moduleCloseIndex = childProcessModuleCloseIndex(tokens, index);
  return moduleCloseIndex === -1
    ? null
    : staticChildProcessMemberAt(tokens, moduleCloseIndex)?.method ?? null;
}

function immutableChildProcessAliasAt(tokens, sourceIndex) {
  if (
    tokens[sourceIndex]?.type !== "identifier" ||
    tokens[sourceIndex - 1]?.value !== "=" ||
    tokens[sourceIndex - 2]?.type !== "identifier" ||
    tokens[sourceIndex - 3]?.value !== "const"
  ) {
    return null;
  }
  const nextToken = tokens[sourceIndex + 1];
  const hasAsiBoundary =
    nextToken?.line > tokens[sourceIndex].line &&
    nextToken.type === "identifier" &&
    !aliasContinuationKeywords.has(nextToken.value);
  if (nextToken && nextToken.value !== ";" && !hasAsiBoundary) {
    return null;
  }
  return {
    availableFrom: nextToken?.value === ";" ? sourceIndex + 2 : sourceIndex + 1,
    local: tokens[sourceIndex - 2].value,
  };
}

function findTopLevelTokenIndexes(tokens) {
  const indexes = new Set();
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (braceDepth === 0 && bracketDepth === 0 && parenthesisDepth === 0) {
      indexes.add(index);
    }
    const value = tokens[index].value;
    if (value === "{") {
      braceDepth += 1;
    } else if (value === "}") {
      braceDepth -= 1;
    } else if (value === "[") {
      bracketDepth += 1;
    } else if (value === "]") {
      bracketDepth -= 1;
    } else if (value === "(") {
      parenthesisDepth += 1;
    } else if (value === ")") {
      parenthesisDepth -= 1;
    }
  }
  return indexes;
}

// The checker has no scope graph. Reject aliases with any use that could be a
// shadow, reassignment, or escape instead of risking a false portability error.
function isUnambiguousImmutableAlias(
  tokens,
  sourceIndex,
  alias,
  promisifiedArgumentIndexes,
) {
  const declarationIndex = sourceIndex - 2;
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.type !== "identifier" || tokens[index].value !== alias.local) {
      continue;
    }
    if (index === declarationIndex) {
      continue;
    }
    if (immutableChildProcessAliasAt(tokens, index)) {
      continue;
    }
    if (promisifiedArgumentIndexes.has(index)) {
      continue;
    }
    if (
      callOpenIndexAt(tokens, index + 1) !== -1 &&
      tokens[index - 1]?.value !== "." &&
      tokens[index - 1]?.value !== "?." &&
      !aliasDeclarationKeywords.has(tokens[index - 1]?.value)
    ) {
      continue;
    }
    return false;
  }
  return true;
}

function propagateImmutableChildProcessAliases(
  tokens,
  bindings,
  promisifiedArgumentIndexes,
  topLevelTokenIndexes,
) {
  let changed = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const alias = immutableChildProcessAliasAt(tokens, index);
    if (
      !alias ||
      !topLevelTokenIndexes.has(index - 3) ||
      bindings.aliases.has(alias.local) ||
      bindings.direct.has(alias.local) ||
      bindings.namespaces.has(alias.local) ||
      !isUnambiguousImmutableAlias(
        tokens,
        index,
        alias,
        promisifiedArgumentIndexes,
      )
    ) {
      continue;
    }
    const method = immutableAliasMethodReferenceAt(tokens, index, bindings);
    if (!method) {
      continue;
    }
    bindings.aliases.set(alias.local, { ...alias, method });
    changed = true;
  }
  return changed;
}

function propagatePromisifiedChildProcessBindings(
  tokens,
  bindings,
  promisifyBindings,
  topLevelTokenIndexes,
) {
  const resolved = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.type !== "identifier" || tokens[index - 1]?.value !== "=") {
      continue;
    }

    const openIndex = promisifyCallOpenIndexAt(tokens, index, promisifyBindings);
    if (openIndex === -1 || tokens[index - 2]?.type !== "identifier") {
      continue;
    }

    const method = promisifiedMethodReferenceAt(tokens, openIndex + 1, bindings);
    const local = tokens[index - 2].value;
    if (method) {
      const closeIndex = findClosingToken(tokens, openIndex, "(", ")");
      const topLevelConst =
        tokens[index - 3]?.value === "const" &&
        topLevelTokenIndexes.has(index - 3);
      resolved.set(local, {
        availableFrom: closeIndex === -1 ? openIndex + 1 : closeIndex + 1,
        method,
        propagationMethod: topLevelConst
          ? immutableAliasMethodReferenceAt(tokens, openIndex + 1, bindings)
          : null,
      });
    }
  }

  let changed = false;
  for (const [local, binding] of resolved) {
    if (
      bindings.direct.get(local) !== binding.method ||
      bindings.promisifiedAvailableFrom.get(local) !== binding.availableFrom
    ) {
      bindings.direct.set(local, binding.method);
      bindings.promisifiedAvailableFrom.set(local, binding.availableFrom);
      changed = true;
    }
    if (binding.propagationMethod && !bindings.propagationDirect.has(local)) {
      bindings.propagationDirect.set(local, {
        availableFrom: binding.availableFrom,
        method: binding.propagationMethod,
      });
      changed = true;
    }
  }
  return changed;
}

function resolveCallAt(tokens, index, bindings) {
  const token = tokens[index];
  if (token?.type !== "identifier") {
    return null;
  }
  const moduleCloseIndex = childProcessModuleCloseIndex(tokens, index);
  const moduleMember =
    moduleCloseIndex === -1 ? null : staticChildProcessMemberAt(tokens, moduleCloseIndex);
  const moduleOpenIndex = moduleMember
    ? callOpenIndexAt(tokens, moduleMember.nextIndex)
    : -1;
  if (moduleMember && moduleOpenIndex !== -1) {
    return {
      method: moduleMember.method,
      openIndex: moduleOpenIndex,
    };
  }
  const alias = bindings.aliases.get(token.value);
  const directMethod =
    (alias && alias.availableFrom <= index ? alias.method : null) ??
    bindings.direct.get(token.value) ??
    injectedMethodNames.get(token.value);
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
  const namespaceMember = bindings.namespaces.has(token.value)
    ? staticChildProcessMemberAt(tokens, index)
    : null;
  const namespaceOpenIndex = namespaceMember
    ? callOpenIndexAt(tokens, namespaceMember.nextIndex)
    : -1;
  if (
    namespaceMember &&
    namespaceOpenIndex !== -1
  ) {
    return { method: namespaceMember.method, openIndex: namespaceOpenIndex };
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

function executableBasename(value) {
  return value.trim().split(/[\\/]+/).filter(Boolean).at(-1)?.toLowerCase() ?? null;
}

function executablePackageManager(value) {
  const basename = executableBasename(value);
  return /^(?:npm|npx)(?:\.cmd|\.bat)?$/i.test(basename ?? "") ? basename : null;
}

function executablePlatformShell(value) {
  const basename = executableBasename(value);
  return platformShellExecutables.has(basename) ? basename : null;
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
    const callLine = tokens[call.openIndex]?.line ?? 1;
    const launchesImplicitShell = call.method === "exec" || call.method === "execSync";
    if (launchesImplicitShell && !allowedLines.has(callLine)) {
      issues.push({
        file,
        label: `${call.method} always launches a platform shell; use execFile or spawn with shell: false`,
        line: callLine,
      });
    }
    const command = tokens[argumentsList[0]?.start];
    if (
      !launchesImplicitShell &&
      (command?.type === "string" || command?.type === "template")
    ) {
      const packageManager = executablePackageManager(command.value);
      if (packageManager && !allowedLines.has(command.line)) {
        issues.push({
          file,
          label: `launch ${packageManager} through Node and its JavaScript CLI instead of a platform shell shim`,
          line: command.line,
        });
      }
      const platformShell = executablePlatformShell(command.value);
      if (platformShell && !allowedLines.has(command.line)) {
        issues.push({
          file,
          label: `platform shell ${platformShell} must not be launched directly`,
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

export function collectCommandPortabilitySourceFiles(repoRoot = resolve(".")) {
  return collectPathPortabilitySourceFiles(resolve(repoRoot)).filter((file) =>
    sourceExtensions.has(extname(file)),
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
      "Use execFile or spawn with literal shell: false, launch npm/npx through process.execPath and its JavaScript CLI, or add a documented command-portability-allow comment for an intentional exception.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Command portability contract ok (${sourceFiles.length} source files checked, ${childProcessFiles.length} child-process files analyzed).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
