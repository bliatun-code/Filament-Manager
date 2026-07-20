import { readFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { collectPathPortabilitySourceFiles } from "./check-path-portability.mjs";

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const workflowSourceExtensions = new Set([".yaml", ".yml"]);
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
const windowsWorkflowPosixShells = new Set([
  "bash",
  "bash.exe",
  "sh",
  "sh.exe",
  "zsh",
  "zsh.exe",
]);
const windowsWorkflowPowerShells = new Set([
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
]);
const windowsWorkflowRunPatterns = [
  {
    label: "Bash error mode must not be used in a Windows workflow job",
    pattern: /^\s*set\s+-[^\s]*e[^\s]*(?:\s|$)/,
  },
  {
    label: "Bash conditional syntax must not be used in a Windows workflow job",
    pattern: /^\s*(?:(?:if|elif)\s+)?\[\[/,
  },
  {
    label: "POSIX export assignments must not be used in a Windows workflow job",
    pattern: /^\s*export\s+[A-Za-z_][A-Za-z0-9_]*=/,
  },
  {
    label: "POSIX variable assignments must not be used in a Windows workflow job",
    pattern: /^\s*[A-Za-z_][A-Za-z0-9_]*=/,
    skipInPowerShellHashtable: true,
    suppressWhenUnprefixedEnvironment: true,
  },
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

function unquotedCommentIndex(
  line,
  escapeCharacter = "\\",
  requiresWhitespaceBoundary = true,
) {
  let quote = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === escapeCharacter && quote === '"') {
        index += 1;
      } else if (character === quote) {
        if (quote === "'" && line[index + 1] === "'") {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === escapeCharacter) {
      index += 1;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (
      character === "#" &&
      (!requiresWhitespaceBoundary ||
        index === 0 ||
        /\s/.test(line[index - 1]))
    ) {
      return index;
    }
  }
  return -1;
}

function hasDocumentedAllowMarker(
  line,
  escapeCharacter,
  requiresWhitespaceBoundary,
) {
  const commentIndex = unquotedCommentIndex(
    line,
    escapeCharacter,
    requiresWhitespaceBoundary,
  );
  if (commentIndex === -1) {
    return false;
  }
  const markerIndex = line.indexOf(allowMarker, commentIndex + 1);
  return (
    markerIndex !== -1 &&
    line.slice(markerIndex + allowMarker.length).trim().length > 0
  );
}

function sourceBeforeComment(
  line,
  escapeCharacter,
  requiresWhitespaceBoundary,
) {
  const commentIndex = unquotedCommentIndex(
    line,
    escapeCharacter,
    requiresWhitespaceBoundary,
  );
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function yamlScalarValue(value) {
  const withoutComment = sourceBeforeComment(value).trim();
  const withoutAnchor = withoutComment.replace(
    /^&[A-Za-z0-9_.-]+(?:\s+|$)/,
    "",
  );
  const quote = withoutAnchor[0];
  if (
    (quote === '"' || quote === "'") &&
    withoutAnchor.at(-1) === quote
  ) {
    return withoutAnchor.slice(1, -1).trim();
  }
  return withoutAnchor;
}

function workflowIndent(source) {
  return source.match(/^ */)[0].length;
}

function windowsRunnerLabel(value) {
  const label = yamlScalarValue(value).toLowerCase();
  return /^windows(?:-[a-z0-9_.-]+)?$/.test(label) ? label : null;
}

function workflowRunnerValueIncludesWindows(lines, index, indent, rawValue) {
  const value = yamlScalarValue(rawValue);
  if (windowsRunnerLabel(value)) {
    return true;
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .some((label) => windowsRunnerLabel(label));
  }
  if (value) {
    return false;
  }
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const candidate = lines[cursor];
    if (!candidate.source.trim() || /^\s*#/.test(candidate.source)) {
      continue;
    }
    if (workflowIndent(candidate.source) <= indent) {
      break;
    }
    const listItem = candidate.source.trim().match(/^-\s+(.+)$/);
    if (listItem && windowsRunnerLabel(listItem[1])) {
      return true;
    }
    const labelsField = candidate.source
      .trim()
      .match(/^(?:labels|"labels"|'labels')\s*:\s*(.*)$/);
    if (labelsField) {
      const labels = yamlScalarValue(labelsField[1]);
      if (windowsRunnerLabel(labels)) {
        return true;
      }
      if (
        labels.startsWith("[") &&
        labels.endsWith("]") &&
        labels
          .slice(1, -1)
          .split(",")
          .some((label) => windowsRunnerLabel(label))
      ) {
        return true;
      }
    }
  }
  return false;
}

function jobDirectIndent(job) {
  const indents = job.lines
    .slice(1)
    .filter(({ source }) => source.trim() && !/^\s*#/.test(source))
    .map(({ source }) => workflowIndent(source))
    .filter((indent) => indent > job.indent);
  return indents.length > 0 ? Math.min(...indents) : null;
}

function jobUsesLiteralWindowsRunner(job) {
  const directIndent = jobDirectIndent(job);
  if (directIndent === null) {
    return false;
  }
  for (let index = 0; index < job.lines.length; index += 1) {
    const entry = job.lines[index];
    if (workflowIndent(entry.source) !== directIndent) {
      continue;
    }
    const match = entry.source
      .trim()
      .match(/^(?:runs-on|"runs-on"|'runs-on')\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }
    const value = yamlScalarValue(match[1]);
    if (
      workflowRunnerValueIncludesWindows(
        job.lines,
        index,
        directIndent,
        match[1],
      )
    ) {
      return true;
    }
    // Matrix jobs commonly guard OS-specific steps individually. Without a
    // full expression evaluator, treating a mixed matrix as Windows-only would
    // create false errors, so this contract deliberately checks literal labels.
    return false;
  }
  return false;
}

function workflowJobs(lines) {
  const jobs = [];
  let insideJobs = false;
  let jobIndent = null;
  let currentJob = null;

  const finishCurrentJob = () => {
    if (currentJob) {
      jobs.push(currentJob);
    }
    currentJob = null;
  };

  for (const [index, source] of lines.entries()) {
    if (!insideJobs) {
      if (
        /^(?:jobs|"jobs"|'jobs')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/.test(
          source,
        )
      ) {
        insideJobs = true;
      }
      continue;
    }

    if (/^#/.test(source) || !source.trim()) {
      if (currentJob) {
        currentJob.lines.push({ line: index + 1, source });
      }
      continue;
    }
    if (/^\S/.test(source)) {
      finishCurrentJob();
      break;
    }

    const jobHeader = source.match(
      /^( +)(?:[A-Za-z0-9_.-]+|"[A-Za-z0-9_.-]+"|'[A-Za-z0-9_.-]+')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/,
    );
    if (jobHeader && jobIndent === null) {
      jobIndent = jobHeader[1].length;
    }
    if (jobHeader && jobHeader[1].length === jobIndent) {
      finishCurrentJob();
      currentJob = { indent: jobIndent, lines: [] };
    }
    if (currentJob) {
      currentJob.lines.push({ line: index + 1, source });
    }
  }
  finishCurrentJob();
  return jobs;
}

function literalWindowsWorkflowJobs(lines) {
  return workflowJobs(lines).filter((job) => jobUsesLiteralWindowsRunner(job));
}

function workflowStepFields(job, fieldName) {
  const fields = [];
  const directIndent = jobDirectIndent(job);
  let stepsIndent = null;
  let stepIndent = null;
  let stepFieldIndent = null;
  let stepIndex = null;

  for (let index = 0; index < job.lines.length; index += 1) {
    const entry = job.lines[index];
    if (stepsIndent === null) {
      const stepsMatch = entry.source.match(
        /^( +)(?:steps|"steps"|'steps')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/,
      );
      if (stepsMatch && stepsMatch[1].length === directIndent) {
        stepsIndent = stepsMatch[1].length;
      }
      continue;
    }
    if (!entry.source.trim() || /^\s*#/.test(entry.source)) {
      continue;
    }

    const indent = workflowIndent(entry.source);
    if (indent <= stepsIndent) {
      break;
    }
    const stepItem = entry.source.match(/^( *)-(\s*)(.*)$/);
    if (stepIndent === null && stepItem && indent > stepsIndent) {
      stepIndent = indent;
    }
    if (stepItem && indent === stepIndent) {
      stepIndex = index;
      stepFieldIndent = Math.max(
        stepIndent + 2,
        stepItem[1].length + 1 + stepItem[2].length,
      );
      const inlineSource = stepItem[3].replace(
        /^&[A-Za-z0-9_.-]+\s+/,
        "",
      );
      const inlineField = inlineSource.match(
        new RegExp(
          `^(?:${fieldName}|"${fieldName}"|'${fieldName}')\\s*:\\s*(.*)$`,
        ),
      );
      if (inlineField) {
        fields.push({
          index,
          keyIndent: stepFieldIndent,
          line: entry.line,
          rawSource: inlineField[1],
          stepIndex,
        });
      }
      continue;
    }
    if (stepIndent !== null && indent === stepFieldIndent) {
      const field = entry.source.trim().match(
        new RegExp(
          `^(?:${fieldName}|"${fieldName}"|'${fieldName}')\\s*:\\s*(.*)$`,
        ),
      );
      if (field) {
        fields.push({
          index,
          keyIndent: indent,
          line: entry.line,
          rawSource: field[1],
          stepIndex,
        });
      }
    }
  }
  return fields;
}

function workflowStepAliases(job) {
  const aliases = [];
  const directIndent = jobDirectIndent(job);
  let stepsIndent = null;
  let stepIndent = null;

  for (const entry of job.lines) {
    if (stepsIndent === null) {
      const stepsValue = entry.source.match(
        /^( +)(?:steps|"steps"|'steps')\s*:\s*(.+)$/,
      );
      if (
        stepsValue &&
        stepsValue[1].length === directIndent &&
        yamlSourceContainsAlias(stepsValue[2])
      ) {
        aliases.push({ line: entry.line, rawSource: stepsValue[2] });
        continue;
      }
      const stepsMatch = entry.source.match(
        /^( +)(?:steps|"steps"|'steps')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/,
      );
      if (stepsMatch && stepsMatch[1].length === directIndent) {
        stepsIndent = stepsMatch[1].length;
      }
      continue;
    }
    if (!entry.source.trim() || /^\s*#/.test(entry.source)) {
      continue;
    }
    const indent = workflowIndent(entry.source);
    if (indent <= stepsIndent) {
      break;
    }
    const stepItem = entry.source.match(/^( *)-\s*(.*)$/);
    if (stepIndent === null && stepItem && indent > stepsIndent) {
      stepIndent = indent;
    }
    if (
      stepItem &&
      indent === stepIndent &&
      /^\*[A-Za-z0-9_.-]+(?:\s|$)/.test(stepItem[2])
    ) {
      aliases.push({ line: entry.line, rawSource: stepItem[2] });
    }
  }
  return aliases;
}

function workflowJobDefaultShellFields(job) {
  const fields = [];
  const directIndent = jobDirectIndent(job);
  if (directIndent === null) {
    return fields;
  }
  for (let index = 0; index < job.lines.length; index += 1) {
    const defaultsEntry = job.lines[index];
    if (
      workflowIndent(defaultsEntry.source) !== directIndent ||
      !/^(?:defaults|"defaults"|'defaults')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/.test(
        defaultsEntry.source.trim(),
      )
    ) {
      continue;
    }
    for (let runIndex = index + 1; runIndex < job.lines.length; runIndex += 1) {
      const runEntry = job.lines[runIndex];
      if (!runEntry.source.trim() || /^\s*#/.test(runEntry.source)) {
        continue;
      }
      const runIndent = workflowIndent(runEntry.source);
      if (runIndent <= directIndent) {
        break;
      }
      if (
        !/^(?:run|"run"|'run')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/.test(
          runEntry.source.trim(),
        )
      ) {
        continue;
      }
      for (
        let shellIndex = runIndex + 1;
        shellIndex < job.lines.length;
        shellIndex += 1
      ) {
        const shellEntry = job.lines[shellIndex];
        if (!shellEntry.source.trim() || /^\s*#/.test(shellEntry.source)) {
          continue;
        }
        if (workflowIndent(shellEntry.source) <= runIndent) {
          break;
        }
        const shell = shellEntry.source
          .trim()
          .match(/^(?:shell|"shell"|'shell')\s*:\s*(.*)$/);
        if (shell) {
          fields.push({ line: shellEntry.line, rawSource: shell[1] });
        }
      }
      break;
    }
    break;
  }
  return fields;
}

function workflowJobAliasFields(job, fieldName) {
  const directIndent = jobDirectIndent(job);
  if (directIndent === null) {
    return [];
  }
  const fields = [];
  for (const entry of job.lines) {
    if (workflowIndent(entry.source) !== directIndent) {
      continue;
    }
    const match = entry.source
      .trim()
      .match(
        new RegExp(
          `^(?:${fieldName}|"${fieldName}"|'${fieldName}')\\s*:\\s*(\\*[A-Za-z0-9_.-]+(?:\\s+#.*)?)$`,
        ),
      );
    if (match) {
      fields.push({ line: entry.line, rawSource: match[1] });
    }
  }
  return fields;
}

function yamlSourceContainsAlias(source) {
  const value = sourceBeforeComment(source);
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === "\\" && quote === '"') {
        index += 1;
      } else if (character === quote) {
        if (quote === "'" && value[index + 1] === "'") {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "`") {
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (
      character === "*" &&
      /^[A-Za-z0-9_.-]+(?:\s|,|\]|\}|$)/.test(value.slice(index + 1))
    ) {
      return true;
    }
  }
  return false;
}

function workflowRunnerAliasFields(job) {
  const directIndent = jobDirectIndent(job);
  if (directIndent === null) {
    return [];
  }
  const fields = [];
  for (let index = 0; index < job.lines.length; index += 1) {
    const entry = job.lines[index];
    if (workflowIndent(entry.source) !== directIndent) {
      continue;
    }
    const match = entry.source
      .trim()
      .match(/^(?:runs-on|"runs-on"|'runs-on')\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }
    if (yamlSourceContainsAlias(match[1])) {
      fields.push({ line: entry.line, rawSource: match[1] });
    }
    if (yamlScalarValue(match[1])) {
      continue;
    }
    for (let cursor = index + 1; cursor < job.lines.length; cursor += 1) {
      const nestedEntry = job.lines[cursor];
      if (!nestedEntry.source.trim() || /^\s*#/.test(nestedEntry.source)) {
        continue;
      }
      if (workflowIndent(nestedEntry.source) <= directIndent) {
        break;
      }
      if (yamlSourceContainsAlias(nestedEntry.source)) {
        fields.push({
          line: nestedEntry.line,
          rawSource: nestedEntry.source,
        });
      }
    }
  }
  return fields;
}

function workflowGlobalDefaultShellFields(lines) {
  const fields = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (
      !/^(?:defaults|"defaults"|'defaults')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/.test(
        lines[index],
      )
    ) {
      continue;
    }
    for (let runIndex = index + 1; runIndex < lines.length; runIndex += 1) {
      const runSource = lines[runIndex];
      if (!runSource.trim() || /^\s*#/.test(runSource)) {
        continue;
      }
      const runIndent = workflowIndent(runSource);
      if (runIndent === 0) {
        break;
      }
      if (
        !/^(?:run|"run"|'run')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/.test(
          runSource.trim(),
        )
      ) {
        continue;
      }
      for (let shellIndex = runIndex + 1; shellIndex < lines.length; shellIndex += 1) {
        const shellSource = lines[shellIndex];
        if (!shellSource.trim() || /^\s*#/.test(shellSource)) {
          continue;
        }
        if (workflowIndent(shellSource) <= runIndent) {
          break;
        }
        const shell = shellSource
          .trim()
          .match(/^(?:shell|"shell"|'shell')\s*:\s*(.*)$/);
        if (shell) {
          fields.push({ line: shellIndex + 1, rawSource: shell[1] });
        }
      }
      break;
    }
    break;
  }
  return fields;
}

function workflowGlobalDefaultAliasFields(lines) {
  const fields = [];
  for (const [index, source] of lines.entries()) {
    const match = source.match(
      /^(?:defaults|"defaults"|'defaults')\s*:\s*(\*[A-Za-z0-9_.-]+(?:\s+#.*)?)$/,
    );
    if (match) {
      fields.push({ line: index + 1, rawSource: match[1] });
    }
  }
  return fields;
}

function isWorkflowBlockScalar(value) {
  return /^[|>](?:[+-]?[1-9]|[1-9][+-]?)?(?:\s+#.*)?$/.test(value.trim());
}

function powerShellHereStringTerminator(source) {
  let quote = null;
  for (let index = 0; index < source.length - 1; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "`" && quote === '"') {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "`") {
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (
      character === "@" &&
      (source[index + 1] === '"' || source[index + 1] === "'") &&
      !source.slice(index + 2).trim()
    ) {
      return {
        interpolates: source[index + 1] === '"',
        terminator: `${source[index + 1]}@`,
      };
    }
  }
  return null;
}

function powerShellQuoteCloseIndex(source, quote, start = 0) {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "`" && quote === '"') {
      index += 1;
    } else if (source[index] === quote) {
      if (quote === "'" && source[index + 1] === "'") {
        index += 1;
      } else {
        return index;
      }
    }
  }
  return -1;
}

function unclosedPowerShellQuote(source) {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "`") {
      index += 1;
      continue;
    }
    const quote = source[index];
    if (quote !== '"' && quote !== "'") {
      continue;
    }
    const closeIndex = powerShellQuoteCloseIndex(source, quote, index + 1);
    if (closeIndex === -1) {
      return { index, quote };
    }
    index = closeIndex;
  }
  return null;
}

function stripPowerShellBlockComments(source, initialInsideBlockComment) {
  let insideBlockComment = initialInsideBlockComment;
  let output = "";
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (insideBlockComment) {
      if (source.startsWith("#>", index)) {
        insideBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      output += character;
      if (character === "`" && quote === '"') {
        output += source[index + 1] ?? "";
        index += 1;
      } else if (character === quote) {
        if (quote === "'" && source[index + 1] === "'") {
          output += source[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      output += character;
    } else if (character === "`") {
      output += character;
      output += source[index + 1] ?? "";
      index += 1;
    } else if (source.startsWith("<#", index)) {
      insideBlockComment = true;
      index += 1;
    } else if (character === "#") {
      output += source.slice(index);
      break;
    } else {
      output += character;
    }
  }
  return { insideBlockComment, source: output };
}

function powerShellHashtableDepthAfter(source, initialDepth) {
  let depth = initialDepth;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "`" && quote === '"') {
        index += 1;
      } else if (character === quote) {
        if (quote === "'" && source[index + 1] === "'") {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "`") {
      index += 1;
      continue;
    }
    if (character === "#") {
      break;
    }
    if (depth === 0 && source.startsWith("@{", index)) {
      depth = 1;
      index += 1;
    } else if (depth > 0 && character === "{") {
      depth += 1;
    } else if (depth > 0 && character === "}") {
      depth -= 1;
    }
  }
  return depth;
}

function workflowRunSources(job) {
  const sources = [];
  for (const field of workflowStepFields(job, "run")) {
    if (!isWorkflowBlockScalar(yamlScalarValue(field.rawSource))) {
      if (field.rawSource.trim()) {
        sources.push({
          line: field.line,
          rawSource: field.rawSource,
          source: yamlScalarValue(field.rawSource),
          stepIndex: field.stepIndex,
        });
      }
      continue;
    }
    let hereString = null;
    let inPowerShellBlockComment = false;
    let multilinePowerShellQuote = null;
    let powerShellHashtableDepth = 0;
    for (let cursor = field.index + 1; cursor < job.lines.length; cursor += 1) {
      const candidate = job.lines[cursor];
      if (!candidate.source.trim()) {
        continue;
      }
      if (workflowIndent(candidate.source) <= field.keyIndent) {
        break;
      }
      const rawCandidateSource = candidate.source;
      let originalSource = rawCandidateSource;
      const originalTrimmed = rawCandidateSource.trim();
      if (hereString) {
        if (originalTrimmed === hereString.terminator) {
          hereString = null;
        } else if (hereString.interpolates) {
          sources.push({
            insidePowerShellHashtable: false,
            line: candidate.line,
            onlyEnvironmentInterpolation: true,
            rawSource: rawCandidateSource,
            source: rawCandidateSource,
            stepIndex: field.stepIndex,
          });
        }
        continue;
      }
      if (multilinePowerShellQuote) {
        const closeIndex = powerShellQuoteCloseIndex(
          originalSource,
          multilinePowerShellQuote,
        );
        if (closeIndex === -1) {
          continue;
        }
        originalSource = originalSource.slice(closeIndex + 1);
        multilinePowerShellQuote = null;
        if (!originalSource.trim()) {
          continue;
        }
      }
      const blockCommentResult = stripPowerShellBlockComments(
        originalSource,
        inPowerShellBlockComment,
      );
      inPowerShellBlockComment = blockCommentResult.insideBlockComment;
      const commandSource = blockCommentResult.source;
      if (!commandSource.trim()) {
        continue;
      }
      const trimmed = commandSource.trim();
      const hereStringStart = powerShellHereStringTerminator(
        sourceBeforeComment(trimmed, "`", false),
      );
      if (hereStringStart) {
        hereString = hereStringStart;
        continue;
      }
      const unclosedQuote = unclosedPowerShellQuote(
        sourceBeforeComment(commandSource, "`", false),
      );
      if (unclosedQuote) {
        const executablePrefix = commandSource.slice(0, unclosedQuote.index);
        if (executablePrefix.trim()) {
          sources.push({
            insidePowerShellHashtable: powerShellHashtableDepth > 0,
            line: candidate.line,
            rawSource: rawCandidateSource,
            source: executablePrefix,
            stepIndex: field.stepIndex,
          });
        }
        sources.push({
          line: candidate.line,
          rawSource: rawCandidateSource,
          reviewAllowSource: field.rawSource,
          requiresReview:
            "multiline PowerShell strings in Windows workflow jobs require a documented portability review",
          source: "",
          stepIndex: field.stepIndex,
        });
        multilinePowerShellQuote = unclosedQuote.quote;
        continue;
      }
      const insidePowerShellHashtable = powerShellHashtableDepth > 0;
      powerShellHashtableDepth = powerShellHashtableDepthAfter(
        commandSource,
        powerShellHashtableDepth,
      );
      sources.push({
        insidePowerShellHashtable,
        line: candidate.line,
        rawSource: rawCandidateSource,
        source: commandSource,
        stepIndex: field.stepIndex,
      });
    }
  }
  return sources;
}

function containsBashRematchExpansion(source) {
  let inSingleQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (!inSingleQuote && source[index] === "`") {
      index += 1;
      continue;
    }
    if (
      !inSingleQuote &&
      source[index] === "$" &&
      /^\$\{?BASH_REMATCH(?:\[|\}?)/.test(source.slice(index))
    ) {
      return true;
    }
  }
  return false;
}

function containsUnprefixedGithubEnvironment(
  source,
  { honorSingleQuotes = true } = {},
) {
  let inSingleQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    if (honorSingleQuotes && source[index] === "'") {
      if (inSingleQuote && source[index + 1] === "'") {
        index += 1;
      } else {
        inSingleQuote = !inSingleQuote;
      }
      continue;
    }
    if (!inSingleQuote && source[index] === "`") {
      index += 1;
      continue;
    }
    if (
      !inSingleQuote &&
      source[index] === "$"
    ) {
      const match = source.slice(index).match(
        /^\$(?:\{(?:(?<bracedScope>[A-Za-z0-9_]+):)?(?<bracedName>(?:GITHUB|RUNNER)_[A-Z0-9_]+)\}|(?:(?<scope>[A-Za-z0-9_]+):)?(?<name>(?:GITHUB|RUNNER)_[A-Z0-9_]+))/i,
      );
      const scope = match?.groups?.bracedScope ?? match?.groups?.scope;
      if (match && scope?.toLowerCase() !== "env") {
        return true;
      }
    }
  }
  return false;
}

function containsUnquotedHeredoc(source) {
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "`" && quote === '"') {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "`") {
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (
      source.startsWith("<<", index) &&
      /^<<-?\s*["']?[A-Za-z_][A-Za-z0-9_]*["']?(?:\s|$)/.test(
        source.slice(index),
      )
    ) {
      return true;
    }
  }
  return false;
}

function powerShellStatementSegments(source) {
  const segments = [];
  let hashtableDepth = 0;
  let quote = null;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "`" && quote === '"') {
        index += 1;
      } else if (character === quote) {
        if (quote === "'" && source[index + 1] === "'") {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "`") {
      index += 1;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (hashtableDepth === 0 && source.startsWith("@{", index)) {
      hashtableDepth = 1;
      index += 1;
      continue;
    }
    if (hashtableDepth > 0) {
      if (character === "{") {
        hashtableDepth += 1;
      } else if (character === "}") {
        hashtableDepth -= 1;
      }
      continue;
    }
    const operatorLength =
      character === ";"
        ? 1
        : source.startsWith("&&", index) || source.startsWith("||", index)
          ? 2
          : 0;
    if (operatorLength > 0) {
      segments.push(source.slice(start, index));
      start = index + operatorLength;
      index += operatorLength - 1;
    }
  }
  segments.push(source.slice(start));
  return segments;
}

function workflowShellExecutable(rawSource) {
  const shellValue = yamlScalarValue(rawSource);
  const withoutPlaceholder = shellValue.replace(/\s+\{0\}\s*$/, "").trim();
  const quotedExecutable = withoutPlaceholder.match(/^(["'])(.*?)\1(?:\s|$)/)?.[2];
  const candidates = [
    quotedExecutable,
    withoutPlaceholder,
    withoutPlaceholder.split(/\s+/)[0],
  ]
    .filter(Boolean)
    .map((candidate) => executableBasename(candidate));
  return (
    candidates.find(
      (candidate) =>
        windowsWorkflowPosixShells.has(candidate) ||
        windowsWorkflowPowerShells.has(candidate),
    ) ?? candidates[0]
  );
}

function posixWorkflowShell(rawSource) {
  const shell = workflowShellExecutable(rawSource);
  return windowsWorkflowPosixShells.has(shell) ? shell : null;
}

function shouldInspectWindowsWorkflowRun(rawShell) {
  if (!rawShell) {
    return true;
  }
  return windowsWorkflowPowerShells.has(workflowShellExecutable(rawShell));
}

export function findWindowsWorkflowCommandPortabilityIssues(
  source,
  file = "<workflow>",
) {
  const lines = source.split(/\r?\n/);
  const issues = [];
  const windowsJobs = literalWindowsWorkflowJobs(lines);

  const inspectAliasFields = (fields, label) => {
    for (const { line, rawSource } of fields) {
      if (!hasDocumentedAllowMarker(rawSource)) {
        issues.push({ file, label, line });
      }
    }
  };

  inspectAliasFields(
    workflowJobs(lines).flatMap((job) => workflowRunnerAliasFields(job)),
    "workflow runner aliases require a documented portability review",
  );

  const inspectShellFields = (fields) => {
    for (const { line, rawSource } of fields) {
      if (hasDocumentedAllowMarker(rawSource)) {
        continue;
      }
      if (/^\*[A-Za-z0-9_.-]+$/.test(yamlScalarValue(rawSource))) {
        issues.push({
          file,
          label:
            "workflow shell aliases in Windows jobs require a documented portability review",
          line,
        });
        continue;
      }
      const shell = posixWorkflowShell(rawSource);
      if (shell) {
        issues.push({
          file,
          label: `POSIX workflow shell ${shell} must not run in a Windows job`,
          line,
        });
      }
    }
  };

  const globalDefaultShellFields = workflowGlobalDefaultShellFields(lines);
  const globalDefaultShell = globalDefaultShellFields[0]?.rawSource;
  const globalDefaultAliasFields = workflowGlobalDefaultAliasFields(lines);
  let globalDefaultIsEffective = false;

  for (const job of windowsJobs) {
    const runSources = workflowRunSources(job);
    const runStepIndexes = new Set(
      workflowStepFields(job, "run").map(({ stepIndex }) => stepIndex),
    );
    const jobDefaultShellFields = workflowJobDefaultShellFields(job);
    const jobDefaultShell = jobDefaultShellFields[0]?.rawSource;
    const jobDefaultAliasFields = workflowJobAliasFields(job, "defaults");
    const stepShellFields = workflowStepFields(job, "shell").filter(
      ({ stepIndex }) => runStepIndexes.has(stepIndex),
    );
    const stepShells = new Map(
      stepShellFields.map((field) => [field.stepIndex, field.rawSource]),
    );
    const jobDefaultIsEffective = [...runStepIndexes].some(
      (stepIndex) => !stepShells.has(stepIndex),
    );
    inspectShellFields(stepShellFields);
    if (jobDefaultIsEffective) {
      inspectShellFields(jobDefaultShellFields);
      inspectAliasFields(
        jobDefaultAliasFields,
        "workflow defaults aliases in Windows jobs require a documented portability review",
      );
      if (
        jobDefaultShellFields.length === 0 &&
        jobDefaultAliasFields.length === 0
      ) {
        globalDefaultIsEffective = true;
      }
    }
    for (const { line, rawSource } of workflowStepAliases(job)) {
      if (!hasDocumentedAllowMarker(rawSource)) {
        issues.push({
          file,
          label:
            "workflow step aliases in Windows jobs require a documented portability review",
          line,
        });
      }
    }

    for (const {
      line,
      insidePowerShellHashtable,
      onlyEnvironmentInterpolation,
      rawSource,
      reviewAllowSource,
      requiresReview,
      source: runSource,
      stepIndex,
    } of runSources) {
      const effectiveShell =
        stepShells.get(stepIndex) ?? jobDefaultShell ?? globalDefaultShell;
      if (requiresReview) {
        if (
          shouldInspectWindowsWorkflowRun(effectiveShell) &&
          !hasDocumentedAllowMarker(rawSource, "`", false) &&
          !hasDocumentedAllowMarker(reviewAllowSource ?? "")
        ) {
          issues.push({ file, label: requiresReview, line });
        }
        continue;
      }
      if (onlyEnvironmentInterpolation) {
        if (
          shouldInspectWindowsWorkflowRun(effectiveShell) &&
          containsUnprefixedGithubEnvironment(runSource, {
            honorSingleQuotes: false,
          })
        ) {
          issues.push({
            file,
            label:
              "GitHub environment variables in Windows workflow jobs require the PowerShell env: prefix",
            line,
          });
        }
        continue;
      }
      if (
        hasDocumentedAllowMarker(rawSource, "`", false) ||
        /^\s*#/.test(runSource)
      ) {
        continue;
      }
      if (/^\*[A-Za-z0-9_.-]+$/.test(yamlScalarValue(rawSource))) {
        issues.push({
          file,
          label:
            "workflow run aliases in Windows jobs require a documented portability review",
          line,
        });
        continue;
      }
      if (!shouldInspectWindowsWorkflowRun(effectiveShell)) {
        continue;
      }
      const runCode = sourceBeforeComment(runSource, "`", false);
      const hasUnprefixedGithubEnvironment =
        containsUnprefixedGithubEnvironment(runCode);
      const statementSegments = powerShellStatementSegments(runCode);
      for (const {
        label,
        pattern,
        skipInPowerShellHashtable,
        suppressWhenUnprefixedEnvironment,
      } of windowsWorkflowRunPatterns) {
        if (
          (insidePowerShellHashtable && skipInPowerShellHashtable) ||
          (hasUnprefixedGithubEnvironment &&
            suppressWhenUnprefixedEnvironment)
        ) {
          continue;
        }
        if (statementSegments.some((segment) => pattern.test(segment))) {
          issues.push({ file, label, line });
        }
      }
      if (containsBashRematchExpansion(runCode)) {
        issues.push({
          file,
          label: "Bash match variables must not be used in a Windows workflow job",
          line,
        });
      }
      if (hasUnprefixedGithubEnvironment) {
        issues.push({
          file,
          label:
            "GitHub environment variables in Windows workflow jobs require the PowerShell env: prefix",
          line,
        });
      }
      if (containsUnquotedHeredoc(runCode)) {
        issues.push({
          file,
          label: "POSIX heredocs must not be used in a Windows workflow job",
          line,
        });
      }
      if (/(?:^|\s)\\\s*$/.test(runCode)) {
        issues.push({
          file,
          label: "POSIX line continuations must not be used in a Windows workflow job",
          line,
        });
      }
    }
  }

  if (globalDefaultIsEffective) {
    inspectShellFields(globalDefaultShellFields);
    inspectAliasFields(
      globalDefaultAliasFields,
      "workflow defaults aliases in Windows workflows require a documented portability review",
    );
  }

  return issues.sort(
    (left, right) =>
      left.line - right.line || left.label.localeCompare(right.label),
  );
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

export function collectWorkflowCommandPortabilitySourceFiles(
  repoRoot = resolve("."),
) {
  const workflowRoot = resolve(repoRoot, ".github", "workflows");
  return collectPathPortabilitySourceFiles(resolve(repoRoot)).filter(
    (file) =>
      file.startsWith(`${workflowRoot}${sep}`) &&
      workflowSourceExtensions.has(extname(file)),
  );
}

export function analyzeCommandPortability(options = {}) {
  const sourceFiles =
    options.sourceFiles ??
    [
      ...collectCommandPortabilitySourceFiles(options.repoRoot),
      ...collectWorkflowCommandPortabilitySourceFiles(options.repoRoot),
    ].sort();
  const childProcessFiles = [];
  const workflowFiles = [];
  const issues = [];
  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    if (workflowSourceExtensions.has(extname(sourceFile))) {
      workflowFiles.push(sourceFile);
      issues.push(
        ...findWindowsWorkflowCommandPortabilityIssues(source, sourceFile),
      );
      continue;
    }
    const bindings = resolveChildProcessBindings(tokenizeSource(source).tokens);
    if (!bindings.referencesChildProcess) {
      continue;
    }
    childProcessFiles.push(sourceFile);
    issues.push(...findCommandPortabilityIssues(source, sourceFile));
  }
  return { childProcessFiles, issues, sourceFiles, workflowFiles };
}

function displayPath(file) {
  const path = relative(resolve("."), file);
  return path && !path.startsWith("..") ? path : file;
}

function runCli() {
  const { childProcessFiles, issues, sourceFiles, workflowFiles } =
    analyzeCommandPortability();
  if (issues.length > 0) {
    console.error("Command portability contract failed:");
    for (const issue of issues) {
      console.error(`  - ${displayPath(issue.file)}:${issue.line}: ${issue.label}`);
    }
    console.error(
      "Use execFile or spawn with literal shell: false, launch npm/npx through process.execPath and its JavaScript CLI, keep Windows workflow run blocks in PowerShell syntax, or add a documented command-portability-allow comment for an intentional exception.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Command portability contract ok (${sourceFiles.length} source files checked, ${childProcessFiles.length} child-process files and ${workflowFiles.length} workflow files analyzed).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
