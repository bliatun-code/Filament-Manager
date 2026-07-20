import { readFileSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { collectPathPortabilitySourceFiles } from "./check-path-portability.mjs";

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const workflowSourceExtensions = new Set([".yaml", ".yml"]);
const packageManifestFileName = "package.json";
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
    label: "POSIX env commands must not be used in a Windows workflow job",
    pattern: /^\s*env(?:\s|$)/i,
  },
  {
    label: "POSIX variable assignments must not be used in a Windows workflow job",
    pattern: /^\s*[A-Za-z_][A-Za-z0-9_]*=/,
    skipInPowerShellHashtable: true,
    suppressWhenUnprefixedEnvironment: true,
  },
  {
    label: "POSIX chmod modes must not be used in a Windows workflow job",
    pattern:
      /^\s*(?:&\s+)?chmod\s+(?:-[A-Za-z]+\s+)*(?:[ugoa]*[+=-][rwxXstugo]+|[0-7]{3,4})(?:\s|$)/i,
  },
  {
    label: "combined POSIX rm -rf flags must not be used in a Windows workflow job",
    pattern: /^\s*rm\s+-(?=[A-Za-z]*r)(?=[A-Za-z]*f)[A-Za-z]+(?:\s|$)/i,
  },
  {
    label: "POSIX shells must not be launched from a Windows PowerShell workflow step",
    pattern: /^\s*(?:&\s+)?(?:bash|sh|zsh)(?:\.exe)?(?:\s|$)/i,
  },
];
const packageScriptPlatformShells = new Set([
  "bash",
  "bash.exe",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "sh.exe",
  "zsh",
  "zsh.exe",
]);
const packageScriptPlatformCommands = new Set([
  "awk",
  "chmod",
  "chown",
  "copy",
  "cp",
  "del",
  "env",
  "grep",
  "ln",
  "move",
  "mv",
  "rm",
  "sed",
  "touch",
  "where",
  "which",
]);

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

function workflowJobRunnerField(job) {
  const directIndent = jobDirectIndent(job);
  if (directIndent === null) {
    return null;
  }
  for (let index = 0; index < job.lines.length; index += 1) {
    const entry = job.lines[index];
    if (workflowIndent(entry.source) !== directIndent) {
      continue;
    }
    const match = entry.source
      .trim()
      .match(/^(?:runs-on|"runs-on"|'runs-on')\s*:\s*(.*)$/);
    if (match) {
      return {
        directIndent,
        index,
        line: entry.line,
        rawSource: match[1],
      };
    }
  }
  return null;
}

function jobUsesLiteralWindowsRunner(job) {
  const runner = workflowJobRunnerField(job);
  if (!runner) {
    return false;
  }
  return (
    workflowRunnerValueIncludesWindows(
      job.lines,
      runner.index,
      runner.directIndent,
      runner.rawSource,
    ) ||
    workflowRunnerAnalysisValues(job, runner).values.some((value) =>
      windowsRunnerLabel(value),
    )
  );
}

function yamlFlowSequenceValues(source) {
  const value = yamlScalarValue(source);
  if (!value.startsWith("[") || !value.endsWith("]")) {
    return null;
  }
  const values = [];
  let quote = null;
  let start = 1;
  let nestedDepth = 0;
  for (let index = 1; index < value.length - 1; index += 1) {
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
    if (character === '"' || character === "'") {
      quote = character;
    } else if ("([{\"".includes(character)) {
      nestedDepth += 1;
    } else if (")]}".includes(character)) {
      nestedDepth = Math.max(0, nestedDepth - 1);
    } else if (character === "," && nestedDepth === 0) {
      values.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(value.slice(start, -1).trim());
  return values.filter(Boolean);
}

function workflowMatrixReference(value) {
  const match = yamlScalarValue(value).match(
    /^\$\{\{\s*matrix(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([^'"\]]+)['"]\])\s*\}\}$/,
  );
  return match?.[1] ?? match?.[2] ?? null;
}

function workflowRunnerAnalysisValues(job, runner) {
  const runnerValue = yamlScalarValue(runner.rawSource);
  const flowValues = yamlFlowSequenceValues(runner.rawSource);
  if (flowValues) {
    return { unresolvedStructure: false, values: flowValues };
  }
  if (runnerValue && !isWorkflowBlockScalar(runnerValue)) {
    return {
      unresolvedStructure: runnerValue.startsWith("{"),
      values: runnerValue.startsWith("{") ? [] : [runner.rawSource],
    };
  }

  const values = [];
  let unresolvedStructure = false;
  for (
    let cursor = runner.index + 1;
    cursor < job.lines.length;
    cursor += 1
  ) {
    const entry = job.lines[cursor];
    if (!entry.source.trim() || /^\s*#/.test(entry.source)) {
      continue;
    }
    if (workflowIndent(entry.source) <= runner.directIndent) {
      break;
    }
    const source = entry.source.trim();
    const listItem = source.match(/^-\s+(.+)$/);
    if (listItem) {
      values.push(...(yamlFlowSequenceValues(listItem[1]) ?? [listItem[1]]));
      continue;
    }
    const labels = source.match(
      /^(?:labels|"labels"|'labels')\s*:\s*(.*)$/,
    );
    if (labels) {
      if (yamlScalarValue(labels[1])) {
        values.push(...(yamlFlowSequenceValues(labels[1]) ?? [labels[1]]));
      }
      continue;
    }
    if (/^(?:group|"group"|'group')\s*:/.test(source)) {
      // A runner group may select Windows hosts even when no literal labels
      // are present, so its platform cannot be inferred safely here.
      unresolvedStructure = true;
      continue;
    }
    if (isWorkflowBlockScalar(runnerValue)) {
      values.push(source);
    } else if (source.includes("${{") || /^\*/.test(source)) {
      unresolvedStructure = true;
    }
  }
  return { unresolvedStructure, values };
}

function workflowRunnerMatrixReference(job, runner) {
  const { unresolvedStructure, values } = workflowRunnerAnalysisValues(
    job,
    runner,
  );
  const axes = values
    .map((value) => workflowMatrixReference(value))
    .filter(Boolean);
  const unresolvedExpression = values.some(
    (value) =>
      yamlScalarValue(value).includes("${{") &&
      !workflowMatrixReference(value),
  );
  return {
    axis: axes.length === 1 ? axes[0] : null,
    unresolved:
      unresolvedStructure || unresolvedExpression || axes.length > 1,
  };
}

function workflowMappingRange(lines, index, indent) {
  let end = lines.length;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const source = lines[cursor].source;
    if (!source.trim() || /^\s*#/.test(source)) {
      continue;
    }
    if (workflowIndent(source) <= indent) {
      end = cursor;
      break;
    }
  }
  return { end, start: index + 1 };
}

function workflowDirectChildIndent(lines, start, end, parentIndent) {
  const indents = lines
    .slice(start, end)
    .filter(({ source }) => source.trim() && !/^\s*#/.test(source))
    .map(({ source }) => workflowIndent(source))
    .filter((indent) => indent > parentIndent);
  return indents.length > 0 ? Math.min(...indents) : null;
}

function workflowJobMatrixBlock(job) {
  const directIndent = jobDirectIndent(job);
  if (directIndent === null) {
    return null;
  }
  for (let index = 0; index < job.lines.length; index += 1) {
    const entry = job.lines[index];
    if (
      workflowIndent(entry.source) !== directIndent ||
      !/^(?:strategy|"strategy"|'strategy')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/.test(
        entry.source.trim(),
      )
    ) {
      continue;
    }
    const strategyRange = workflowMappingRange(
      job.lines,
      index,
      directIndent,
    );
    const strategyChildIndent = workflowDirectChildIndent(
      job.lines,
      strategyRange.start,
      strategyRange.end,
      directIndent,
    );
    if (strategyChildIndent === null) {
      return null;
    }
    for (
      let cursor = strategyRange.start;
      cursor < strategyRange.end;
      cursor += 1
    ) {
      const candidate = job.lines[cursor];
      if (
        workflowIndent(candidate.source) !== strategyChildIndent ||
        !/^(?:matrix|"matrix"|'matrix')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/.test(
          candidate.source.trim(),
        )
      ) {
        continue;
      }
      return {
        end: workflowMappingRange(
          job.lines,
          cursor,
          strategyChildIndent,
        ).end,
        indent: strategyChildIndent,
        start: cursor + 1,
      };
    }
  }
  return null;
}

function workflowLiteralMatrixValue(rawSource) {
  const value = yamlScalarValue(rawSource);
  if (
    !value ||
    value.includes("${{") ||
    /^\*/.test(value) ||
    /^[{[]/.test(value)
  ) {
    return null;
  }
  return value;
}

function workflowBlockListValues(lines, index, indent, end) {
  const range = workflowMappingRange(lines, index, indent);
  const listEnd = Math.min(range.end, end);
  const itemIndent = workflowDirectChildIndent(
    lines,
    index + 1,
    listEnd,
    indent,
  );
  if (itemIndent === null) {
    return { complete: false, values: [] };
  }
  const values = [];
  let complete = true;
  for (let cursor = index + 1; cursor < listEnd; cursor += 1) {
    const entry = lines[cursor];
    if (!entry.source.trim() || /^\s*#/.test(entry.source)) {
      continue;
    }
    if (workflowIndent(entry.source) !== itemIndent) {
      continue;
    }
    const item = entry.source.trim().match(/^-\s+(.+)$/);
    const value = item ? workflowLiteralMatrixValue(item[1]) : null;
    if (value) {
      values.push(value);
    } else {
      complete = false;
    }
  }
  return { complete: complete && values.length > 0, values };
}

function workflowMatrixIncludeValues(job, matrix, axisFieldPattern) {
  const matrixChildIndent = workflowDirectChildIndent(
    job.lines,
    matrix.start,
    matrix.end,
    matrix.indent,
  );
  if (matrixChildIndent === null) {
    return { complete: false, present: false, values: [] };
  }
  for (let index = matrix.start; index < matrix.end; index += 1) {
    const entry = job.lines[index];
    if (workflowIndent(entry.source) !== matrixChildIndent) {
      continue;
    }
    const include = entry.source
      .trim()
      .match(/^(?:include|"include"|'include')\s*:\s*(.*)$/);
    if (!include) {
      continue;
    }
    const inlineInclude = yamlScalarValue(include[1]);
    if (inlineInclude) {
      return {
        complete: inlineInclude === "[]",
        coversAllItems: inlineInclude === "[]",
        present: true,
        values: [],
      };
    }
    const includeRange = workflowMappingRange(
      job.lines,
      index,
      matrixChildIndent,
    );
    const itemIndent = workflowDirectChildIndent(
      job.lines,
      includeRange.start,
      includeRange.end,
      matrixChildIndent,
    );
    if (itemIndent === null) {
      return { complete: false, present: true, values: [] };
    }
    const values = [];
    let items = 0;
    let matchedItems = 0;
    let invalidAxisItems = 0;
    for (
      let itemIndex = includeRange.start;
      itemIndex < includeRange.end;
      itemIndex += 1
    ) {
      const item = job.lines[itemIndex];
      if (workflowIndent(item.source) !== itemIndent) {
        continue;
      }
      const itemMatch = item.source.trim().match(/^-\s*(.*)$/);
      if (!itemMatch) {
        continue;
      }
      items += 1;
      const itemSource = itemMatch[1].trim();
      let opaqueAxisValue =
        /^(?:\$\{\{|\*|\{|\[|<<\s*:)/.test(itemSource) ||
        yamlSourceContainsAlias(itemSource);
      let rawValue = itemSource.match(axisFieldPattern)?.[1] ?? null;
      const itemRange = workflowMappingRange(
        job.lines,
        itemIndex,
        itemIndent,
      );
      if (!rawValue) {
        const childIndent = workflowDirectChildIndent(
          job.lines,
          itemIndex + 1,
          Math.min(itemRange.end, includeRange.end),
          itemIndent,
        );
        for (
          let cursor = itemIndex + 1;
          childIndent !== null &&
          cursor < Math.min(itemRange.end, includeRange.end);
          cursor += 1
        ) {
          const candidate = job.lines[cursor];
          if (workflowIndent(candidate.source) !== childIndent) {
            continue;
          }
          rawValue = candidate.source.trim().match(axisFieldPattern)?.[1] ?? null;
          if (rawValue) {
            break;
          }
          if (
            /^(?:\$\{\{|\*|\{|\[|<<\s*:)/.test(candidate.source.trim()) ||
            yamlSourceContainsAlias(candidate.source.trim())
          ) {
            opaqueAxisValue = true;
          }
        }
      }
      const value = rawValue ? workflowLiteralMatrixValue(rawValue) : null;
      if (value) {
        values.push(value);
        matchedItems += 1;
      } else if (rawValue) {
        invalidAxisItems += 1;
      } else if (opaqueAxisValue) {
        invalidAxisItems += 1;
      }
    }
    return {
      complete: invalidAxisItems === 0,
      coversAllItems: items > 0 && matchedItems === items,
      present: true,
      values,
    };
  }
  return {
    complete: true,
    coversAllItems: false,
    present: false,
    values: [],
  };
}

function workflowLiteralMatrixCandidates(job, axis) {
  const matrix = workflowJobMatrixBlock(job);
  if (!matrix) {
    return { complete: false, values: new Set(), windowsValues: new Set() };
  }
  const escapedAxis = axis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const axisFieldPattern = new RegExp(
    `^(?:${escapedAxis}|"${escapedAxis}"|'${escapedAxis}')\\s*:\\s*(.*)$`,
  );
  const matrixChildIndent = workflowDirectChildIndent(
    job.lines,
    matrix.start,
    matrix.end,
    matrix.indent,
  );
  let primaryPresent = false;
  let primaryComplete = false;
  const values = [];
  if (matrixChildIndent !== null) {
    for (let index = matrix.start; index < matrix.end; index += 1) {
      const entry = job.lines[index];
      if (workflowIndent(entry.source) !== matrixChildIndent) {
        continue;
      }
      const field = entry.source.trim().match(axisFieldPattern);
      if (!field) {
        continue;
      }
      primaryPresent = true;
      const flowValues = yamlFlowSequenceValues(field[1]);
      if (flowValues) {
        const literalValues = flowValues
          .map((value) => workflowLiteralMatrixValue(value))
          .filter(Boolean);
        values.push(...literalValues);
        primaryComplete =
          flowValues.length > 0 && literalValues.length === flowValues.length;
      } else if (!yamlScalarValue(field[1])) {
        const blockValues = workflowBlockListValues(
          job.lines,
          index,
          matrixChildIndent,
          matrix.end,
        );
        values.push(...blockValues.values);
        primaryComplete = blockValues.complete;
      }
      break;
    }
  }
  const include = workflowMatrixIncludeValues(
    job,
    matrix,
    axisFieldPattern,
  );
  values.push(...include.values);
  const complete = primaryPresent
    ? primaryComplete && include.complete
    : include.present && include.complete && include.coversAllItems;
  const uniqueValues = new Set(values);
  return {
    complete,
    values: uniqueValues,
    windowsValues: new Set(
      [...uniqueValues].filter((value) => windowsRunnerLabel(value)),
    ),
  };
}

function workflowJobWindowsContext(job) {
  const runner = workflowJobRunnerField(job);
  if (!runner) {
    return { context: null, review: null };
  }
  if (jobUsesLiteralWindowsRunner(job)) {
    return { context: { kind: "literal" }, review: null };
  }
  const matrixReference = workflowRunnerMatrixReference(job, runner);
  if (!matrixReference.axis) {
    return {
      context: null,
      review: matrixReference.unresolved ? runner : null,
    };
  }
  const candidates = workflowLiteralMatrixCandidates(
    job,
    matrixReference.axis,
  );
  const context =
    candidates.windowsValues.size > 0
      ? {
          axis: matrixReference.axis,
          kind: "matrix",
          values: candidates.values,
          windowsValues: candidates.windowsValues,
        }
      : null;
  return {
    context,
    review:
      candidates.complete && !matrixReference.unresolved ? null : runner,
  };
}

function workflowIfExpression(rawSource) {
  let expression = yamlScalarValue(rawSource).trim();
  const wrapped = expression.match(/^\$\{\{([\s\S]*)\}\}$/);
  if (wrapped) {
    expression = wrapped[1].trim();
  }
  return expression;
}

function workflowComparisonOperand(source) {
  const literal = source.match(/^(['"])([\s\S]*)\1$/);
  if (literal) {
    return { kind: "literal", value: literal[2] };
  }
  if (/^runner\.os$/i.test(source)) {
    return { kind: "runner" };
  }
  const matrix = source.match(
    /^matrix(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[['"]([^'"\]]+)['"]\])$/,
  );
  if (matrix) {
    return { axis: matrix[1] ?? matrix[2], kind: "matrix" };
  }
  return null;
}

function workflowIfComparison(rawSource) {
  const expression = workflowIfExpression(rawSource);
  const comparison = expression.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
  if (!comparison) {
    return null;
  }
  const left = workflowComparisonOperand(comparison[1].trim());
  const right = workflowComparisonOperand(comparison[3].trim());
  if (!left || !right) {
    return null;
  }
  const reference = left.kind === "literal" ? right : left;
  const literal = left.kind === "literal" ? left : right;
  if (reference.kind === "literal" || literal.kind !== "literal") {
    return null;
  }
  return { literal, operator: comparison[2], reference };
}

function workflowMatrixContextHasValue(context, value) {
  const normalizedValue = value.toLowerCase();
  return [...context.values].some(
    (candidate) => candidate.toLowerCase() === normalizedValue,
  );
}

function workflowIfProvablyExcludesWindows(rawSource, context) {
  const expression = workflowIfExpression(rawSource);
  if (/^false$/i.test(expression)) {
    return true;
  }
  const comparison = workflowIfComparison(rawSource);
  if (!comparison) {
    return false;
  }
  const value = comparison.literal.value.toLowerCase();
  if (comparison.reference.kind === "runner") {
    return (
      (comparison.operator === "!=" && value === "windows") ||
      (comparison.operator === "==" &&
        (value === "linux" || value === "macos"))
    );
  }
  if (
    context.kind !== "matrix" ||
    comparison.reference.kind !== "matrix" ||
    comparison.reference.axis !== context.axis
  ) {
    return false;
  }
  if (comparison.operator === "==") {
    return (
      workflowMatrixContextHasValue(context, comparison.literal.value) &&
      !windowsRunnerLabel(comparison.literal.value)
    );
  }
  return (
    context.windowsValues.size === 1 &&
    [...context.windowsValues][0].toLowerCase() === value
  );
}

function workflowIfRequiresPortabilityReview(rawSource, context) {
  const expression = workflowIfExpression(rawSource);
  const escapedAxis =
    context.kind === "matrix"
      ? context.axis.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : null;
  const referencesPlatform =
    /\brunner\.os\b/i.test(expression) ||
    (escapedAxis !== null &&
      new RegExp(
        `\\bmatrix\\.${escapedAxis}\\b|matrix\\[['"]${escapedAxis}['"]\\]`,
      ).test(expression));
  if (!referencesPlatform || /^false$/i.test(expression)) {
    return false;
  }
  const comparison = workflowIfComparison(rawSource);
  if (!comparison) {
    return true;
  }
  if (comparison.reference.kind === "runner") {
    return !/^(?:windows|linux|macos)$/i.test(comparison.literal.value);
  }
  return !(
    context.kind === "matrix" &&
    comparison.reference.kind === "matrix" &&
    comparison.reference.axis === context.axis &&
    workflowMatrixContextHasValue(context, comparison.literal.value)
  );
}

function workflowStepIfFields(job) {
  const fields = new Map();
  for (const field of workflowStepFields(job, "if")) {
    const stepFields = fields.get(field.stepIndex) ?? [];
    stepFields.push(field);
    fields.set(field.stepIndex, stepFields);
  }
  return fields;
}

function windowsWorkflowRunStepContext(job, context) {
  const ifFields = workflowStepIfFields(job);
  const relevantStepIndexes = new Set();
  const reviews = [];
  for (const { stepIndex } of workflowStepFields(job, "run")) {
    const fields = ifFields.get(stepIndex) ?? [];
    if (
      fields.length === 1 &&
      workflowIfProvablyExcludesWindows(fields[0].rawSource, context)
    ) {
      continue;
    }
    if (
      fields.length === 1 &&
      workflowIfRequiresPortabilityReview(fields[0].rawSource, context)
    ) {
      reviews.push(fields[0]);
      continue;
    }
    relevantStepIndexes.add(stepIndex);
  }
  return { relevantStepIndexes, reviews };
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

function workflowEnvironmentName(source) {
  const match = source.trim().match(
    /^(?:([A-Za-z_][A-Za-z0-9_]*)|"([A-Za-z_][A-Za-z0-9_]*)"|'([A-Za-z_][A-Za-z0-9_]*)')\s*:/,
  );
  return (match?.[1] ?? match?.[2] ?? match?.[3])?.toUpperCase() ?? null;
}

function workflowEnvironmentNamesFromBlock(entries, headerIndex, headerIndent) {
  const names = new Set();
  let keyIndent = null;
  for (let index = headerIndex + 1; index < entries.length; index += 1) {
    const source = entries[index].source;
    if (!source.trim() || /^\s*#/.test(source)) {
      continue;
    }
    const indent = workflowIndent(source);
    if (indent <= headerIndent) {
      break;
    }
    if (keyIndent === null) {
      keyIndent = indent;
    }
    if (indent !== keyIndent) {
      continue;
    }
    const name = workflowEnvironmentName(source);
    if (name) {
      names.add(name);
    }
  }
  return names;
}

function workflowEnvironmentBlockHeader(source) {
  return /^(?:env|"env"|'env')\s*:\s*(?:&[A-Za-z0-9_.-]+\s*)?(?:#.*)?$/.test(
    source.trim(),
  );
}

function workflowGlobalEnvironmentNames(lines) {
  const entries = lines.map((source) => ({ source }));
  for (let index = 0; index < entries.length; index += 1) {
    if (
      workflowIndent(entries[index].source) === 0 &&
      workflowEnvironmentBlockHeader(entries[index].source)
    ) {
      return workflowEnvironmentNamesFromBlock(entries, index, 0);
    }
  }
  return new Set();
}

function workflowJobEnvironmentNames(job) {
  const directIndent = jobDirectIndent(job);
  if (directIndent === null) {
    return new Set();
  }
  for (let index = 0; index < job.lines.length; index += 1) {
    if (
      workflowIndent(job.lines[index].source) === directIndent &&
      workflowEnvironmentBlockHeader(job.lines[index].source)
    ) {
      return workflowEnvironmentNamesFromBlock(
        job.lines,
        index,
        directIndent,
      );
    }
  }
  return new Set();
}

function workflowStepEnvironmentNames(job) {
  const namesByStep = new Map();
  for (const field of workflowStepFields(job, "env")) {
    if (yamlScalarValue(field.rawSource)) {
      continue;
    }
    const names = workflowEnvironmentNamesFromBlock(
      job.lines,
      field.index,
      field.keyIndent,
    );
    const existing = namesByStep.get(field.stepIndex) ?? new Set();
    for (const name of names) {
      existing.add(name);
    }
    namesByStep.set(field.stepIndex, existing);
  }
  return namesByStep;
}

function mergedWorkflowEnvironmentNames(...groups) {
  const names = new Set();
  for (const group of groups) {
    for (const name of group ?? []) {
      names.add(name);
    }
  }
  return names;
}

function isWorkflowBlockScalar(value) {
  return /^[|>](?:[+-][1-9]?|[1-9][+-]?)?(?:\s+#.*)?$/.test(value.trim());
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

function unprefixedDeclaredEnvironmentReferences(
  source,
  declaredNames,
  localVariables,
  { honorSingleQuotes = true, trackAssignments = true } = {},
) {
  const references = new Set();
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
    if (inSingleQuote || source[index] !== "$") {
      continue;
    }
    const match = source.slice(index).match(
      /^\$(?:\{(?:(?<bracedScope>[A-Za-z_][A-Za-z0-9_]*):)?(?<bracedName>[A-Za-z_][A-Za-z0-9_]*)\}|(?:(?<scope>[A-Za-z_][A-Za-z0-9_]*):)?(?<name>[A-Za-z_][A-Za-z0-9_]*))/,
    );
    if (!match) {
      continue;
    }
    const scope = match.groups?.bracedScope ?? match.groups?.scope;
    const name = (
      match.groups?.bracedName ?? match.groups?.name
    )?.toUpperCase();
    index += match[0].length - 1;
    if (!name || !declaredNames.has(name) || scope?.toLowerCase() === "env") {
      continue;
    }
    const remainder = source.slice(index + 1);
    const assignment = /^\s*(?:\+=|-=|\*=|\/=|%=|=(?!=))/.test(remainder);
    if (trackAssignments && assignment) {
      localVariables.add(name);
      continue;
    }
    if (!localVariables.has(name)) {
      references.add(name);
    }
  }
  return references;
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

const windowsWorkflowCallOperatorCommands = new Set([
  "bash",
  "chmod",
  "env",
  "rm",
  "sh",
  "zsh",
]);

function normalizedExecutableBasename(value) {
  return executableBasename(value)?.replace(/\.exe$/i, "") ?? null;
}

function powerShellStaticCommandLiteral(source, start) {
  const quote = source[start];
  if (quote === '"' || quote === "'") {
    let value = "";
    for (let index = start + 1; index < source.length; index += 1) {
      const character = source[index];
      if (quote === '"' && (character === "`" || character === "$")) {
        return null;
      }
      if (character === quote) {
        if (quote === "'" && source[index + 1] === "'") {
          value += "'";
          index += 1;
          continue;
        }
        return { end: index + 1, value };
      }
      value += character;
    }
    return null;
  }

  const token = source.slice(start).match(/^[^\s()]+/)?.[0] ?? "";
  if (!token || /[\x22\x27`$]/.test(token)) {
    return null;
  }
  return { end: start + token.length, value: token };
}

function normalizedPowerShellCallOperatorStatement(segment) {
  const source = segment.trimStart();
  if (!source.startsWith("&")) {
    return null;
  }

  let index = 1;
  while (/\s/.test(source[index] ?? "")) {
    index += 1;
  }
  let parenthesisDepth = 0;
  while (source[index] === "(") {
    parenthesisDepth += 1;
    index += 1;
    while (/\s/.test(source[index] ?? "")) {
      index += 1;
    }
  }

  const literal = powerShellStaticCommandLiteral(source, index);
  if (!literal) {
    return null;
  }
  index = literal.end;
  for (let depth = 0; depth < parenthesisDepth; depth += 1) {
    while (/\s/.test(source[index] ?? "")) {
      index += 1;
    }
    if (source[index] !== ")") {
      return null;
    }
    index += 1;
  }
  if (source[index] && !/\s/.test(source[index])) {
    return null;
  }

  const command = normalizedExecutableBasename(literal.value);
  if (!command || !windowsWorkflowCallOperatorCommands.has(command)) {
    return null;
  }
  const rest = source.slice(index).trimStart();
  return rest ? `${command} ${rest}` : command;
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
  const jobs = workflowJobs(lines);
  const windowsJobs = [];

  for (const job of jobs) {
    const { context, review } = workflowJobWindowsContext(job);
    if (
      review &&
      !hasDocumentedAllowMarker(review.rawSource)
    ) {
      issues.push({
        file,
        label:
          "workflow matrix runner expressions or runner mappings require a documented portability review",
        line: review.line,
      });
    }
    if (context) {
      windowsJobs.push({ context, job });
    }
  }

  const inspectAliasFields = (fields, label) => {
    for (const { line, rawSource } of fields) {
      if (!hasDocumentedAllowMarker(rawSource)) {
        issues.push({ file, label, line });
      }
    }
  };

  inspectAliasFields(
    jobs.flatMap((job) => workflowRunnerAliasFields(job)),
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
      if (yamlScalarValue(rawSource).includes("${{")) {
        issues.push({
          file,
          label:
            "dynamic workflow shells in Windows jobs require a documented portability review",
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
  const globalEnvironmentNames = workflowGlobalEnvironmentNames(lines);
  let globalDefaultIsEffective = false;

  for (const { context, job } of windowsJobs) {
    const { relevantStepIndexes: runStepIndexes, reviews } =
      windowsWorkflowRunStepContext(job, context);
    for (const review of reviews) {
      if (!hasDocumentedAllowMarker(review.rawSource)) {
        issues.push({
          file,
          label:
            "workflow matrix step conditions require a documented portability review",
          line: review.line,
        });
      }
    }
    const runSources = workflowRunSources(job).filter(({ stepIndex }) =>
      runStepIndexes.has(stepIndex),
    );
    const jobEnvironmentNames = workflowJobEnvironmentNames(job);
    const stepEnvironmentNames = workflowStepEnvironmentNames(job);
    const localVariablesByStep = new Map();
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
      const declaredEnvironmentNames = mergedWorkflowEnvironmentNames(
        globalEnvironmentNames,
        jobEnvironmentNames,
        stepEnvironmentNames.get(stepIndex),
      );
      const localVariables = localVariablesByStep.get(stepIndex) ?? new Set();
      localVariablesByStep.set(stepIndex, localVariables);
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
        if (!shouldInspectWindowsWorkflowRun(effectiveShell)) {
          continue;
        }
        if (
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
        for (const name of unprefixedDeclaredEnvironmentReferences(
          runSource,
          declaredEnvironmentNames,
          localVariables,
          { honorSingleQuotes: false, trackAssignments: false },
        )) {
          issues.push({
            file,
            label: `workflow environment variable ${name} requires the PowerShell env: prefix`,
            line,
          });
        }
        continue;
      }
      if (/^\s*#/.test(runSource)) {
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
      const declaredEnvironmentReferences =
        unprefixedDeclaredEnvironmentReferences(
          runCode,
          declaredEnvironmentNames,
          localVariables,
        );
      if (hasDocumentedAllowMarker(rawSource, "`", false)) {
        continue;
      }
      for (const name of declaredEnvironmentReferences) {
        issues.push({
          file,
          label: `workflow environment variable ${name} requires the PowerShell env: prefix`,
          line,
        });
      }
      const hasUnprefixedGithubEnvironment =
        containsUnprefixedGithubEnvironment(runCode);
      const statementSegments = powerShellStatementSegments(runCode);
      const callOperatorSegments = statementSegments
        .map((segment) => normalizedPowerShellCallOperatorStatement(segment))
        .filter(Boolean);
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
        if (
          statementSegments.some((segment) => pattern.test(segment)) ||
          callOperatorSegments.some((segment) => pattern.test(segment))
        ) {
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

function sourceLineAtOffset(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function packageScriptSegments(command) {
  const segments = [];
  let quote = null;
  let start = 0;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (character === "\\" && quote === '"') {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    const operatorLength =
      command.startsWith("&&", index) || command.startsWith("||", index)
        ? 2
        : command.startsWith("\r\n", index)
          ? 2
          : character === "|" || character === ";" || character === "&"
            ? 1
            : character === "\n" || character === "\r"
              ? 1
              : 0;
    if (operatorLength > 0) {
      segments.push(command.slice(start, index));
      start = index + operatorLength;
      index += operatorLength - 1;
    }
  }
  segments.push(command.slice(start));
  return segments;
}

function packageScriptCommandToken(segment) {
  const source = segment.trim().replace(/^\(+\s*/, "");
  const match = source.match(/^(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
  return {
    command: match?.[1] ?? match?.[2] ?? match?.[3] ?? "",
    rest: match ? source.slice(match[0].length).trimStart() : "",
    source,
  };
}

function packageScriptPortabilityLabels(command) {
  const labels = new Set();
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (character === "\\" && quote === '"') {
        index += 1;
      } else if (character === quote) {
        quote = null;
      } else if (quote === '"' && (character === "$" || character === "`")) {
        labels.add("uses POSIX shell expansion");
      }
      continue;
    }
    if (character === "\\") {
      if (command[index + 1] === "\n" || command.startsWith("\r\n", index + 1)) {
        labels.add("uses a POSIX line continuation");
      }
      index += 1;
      continue;
    }
    if (character === '"') {
      quote = character;
    } else if (character === "'") {
      labels.add("uses single-quoted shell arguments");
      quote = character;
    } else if (character === "`") {
      labels.add("uses POSIX shell expansion");
      quote = character;
    } else if (character === "$") {
      labels.add("uses POSIX shell expansion");
    } else if (character === "^") {
      labels.add("uses a Windows cmd escape");
    } else if (character === ";") {
      labels.add("uses a POSIX statement separator");
    } else if (
      character === "&" &&
      command[index - 1] !== "&" &&
      command[index + 1] !== "&"
    ) {
      labels.add("uses a platform-specific background separator");
    }
  }
  if (/%[A-Za-z_][A-Za-z0-9_]*%/.test(command)) {
    labels.add("uses Windows cmd environment expansion");
  }

  for (const segment of packageScriptSegments(command)) {
    const { command: executable, rest, source } = packageScriptCommandToken(segment);
    if (!executable) {
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(source)) {
      labels.add("uses a POSIX environment assignment");
    }
    const basename = executableBasename(executable);
    if (!basename) {
      continue;
    }
    if (basename === "export") {
      labels.add("uses POSIX export syntax");
    }
    if (packageScriptPlatformShells.has(basename)) {
      labels.add(`launches the platform shell ${basename}`);
    }
    if (/\.(?:bat|cmd)$/i.test(basename)) {
      labels.add(`launches the Windows shell shim ${basename}`);
    }
    const normalizedBasename = basename.replace(/\.exe$/i, "");
    if (packageScriptPlatformCommands.has(normalizedBasename)) {
      labels.add(`uses the platform-specific command ${basename}`);
    }
    if (basename === "mkdir" && /^-p(?:\s|$)/i.test(rest)) {
      labels.add("uses POSIX mkdir -p syntax");
    }
  }
  return [...labels];
}

function packageScriptLine(source, scriptName, searchFrom) {
  const key = JSON.stringify(scriptName);
  const index = source.indexOf(key, searchFrom);
  return index === -1 ? 1 : sourceLineAtOffset(source, index);
}

export function findPackageScriptCommandPortabilityIssues(
  source,
  file = packageManifestFileName,
) {
  const manifest = JSON.parse(source);
  const scripts = manifest?.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return [];
  }
  const scriptsOffset = source.indexOf('"scripts"');
  const issues = [];
  for (const [scriptName, command] of Object.entries(scripts)) {
    if (typeof command !== "string") {
      continue;
    }
    const line = packageScriptLine(source, scriptName, Math.max(scriptsOffset, 0));
    for (const reason of packageScriptPortabilityLabels(command)) {
      issues.push({
        file,
        label: `package script ${JSON.stringify(scriptName)} ${reason}`,
        line,
      });
    }
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

function argumentIsSingleIdentifier(tokens, argument, values) {
  return (
    argument.end === argument.start + 1 &&
    tokens[argument.start]?.type === "identifier" &&
    values.has(tokens[argument.start].value)
  );
}

function argumentIsInlineDelimited(tokens, argument, open, close) {
  if (tokens[argument.start]?.value !== open) {
    return false;
  }
  return findClosingToken(tokens, argument.start, open, close) === argument.end - 1;
}

function argumentIsInlineCallback(tokens, argument) {
  const first = tokens[argument.start];
  if (
    first?.value === "function" ||
    (first?.value === "async" && tokens[argument.start + 1]?.value === "function")
  ) {
    return true;
  }
  return tokens
    .slice(argument.start, argument.end)
    .some((token) => token.value === "=>");
}

function argumentIsSafeOptionsValue(tokens, argument) {
  return (
    argumentIsInlineDelimited(tokens, argument, "{", "}") ||
    argumentIsSingleIdentifier(tokens, argument, new Set(["null", "undefined"]))
  );
}

function dynamicChildProcessOptionsArgument(tokens, method, argumentsList) {
  if (method === "exec" || method === "execSync" || argumentsList.length <= 1) {
    return null;
  }
  const second = argumentsList[1];
  const third = argumentsList[2];
  const secondIsArguments = argumentIsInlineDelimited(tokens, second, "[", "]");
  const secondIsOptions = argumentIsSafeOptionsValue(tokens, second);

  if (method !== "execFile") {
    if (argumentsList.length === 2) {
      return secondIsArguments || secondIsOptions ? null : second;
    }
    return argumentIsSafeOptionsValue(tokens, third) ? null : third;
  }

  if (argumentsList.length === 2) {
    return secondIsArguments || secondIsOptions || argumentIsInlineCallback(tokens, second)
      ? null
      : second;
  }
  if (argumentsList.length === 3 && argumentIsInlineCallback(tokens, third)) {
    return secondIsArguments || secondIsOptions ? null : second;
  }
  return argumentIsSafeOptionsValue(tokens, third) ? null : third;
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
    const dynamicOptionsArgument = dynamicChildProcessOptionsArgument(
      tokens,
      call.method,
      argumentsList,
    );
    const dynamicOptionsLine = tokens[dynamicOptionsArgument?.start]?.line;
    if (
      dynamicOptionsArgument &&
      !allowedLines.has(callLine) &&
      !allowedLines.has(dynamicOptionsLine)
    ) {
      issues.push({
        file,
        label:
          "child-process options must be omitted, nullish, or an inline object literal",
        line: dynamicOptionsLine ?? callLine,
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

export function collectPackageCommandPortabilitySourceFiles(
  repoRoot = resolve("."),
) {
  return collectPathPortabilitySourceFiles(resolve(repoRoot)).filter(
    (file) => file.split(sep).at(-1) === packageManifestFileName,
  );
}

export function analyzeCommandPortability(options = {}) {
  const sourceFiles =
    options.sourceFiles ??
    [
      ...collectCommandPortabilitySourceFiles(options.repoRoot),
      ...collectWorkflowCommandPortabilitySourceFiles(options.repoRoot),
      ...collectPackageCommandPortabilitySourceFiles(options.repoRoot),
    ].sort();
  const childProcessFiles = [];
  const packageFiles = [];
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
    if (sourceFile.split(sep).at(-1) === packageManifestFileName) {
      packageFiles.push(sourceFile);
      issues.push(
        ...findPackageScriptCommandPortabilityIssues(source, sourceFile),
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
  return {
    childProcessFiles,
    issues,
    packageFiles,
    sourceFiles,
    workflowFiles,
  };
}

function displayPath(file) {
  const path = relative(resolve("."), file);
  return path && !path.startsWith("..") ? path : file;
}

function runCli() {
  const {
    childProcessFiles,
    issues,
    packageFiles,
    sourceFiles,
    workflowFiles,
  } =
    analyzeCommandPortability();
  if (issues.length > 0) {
    console.error("Command portability contract failed:");
    for (const issue of issues) {
      console.error(`  - ${displayPath(issue.file)}:${issue.line}: ${issue.label}`);
    }
    console.error(
      "Use portable package scripts, execFile or spawn with literal shell: false, launch npm/npx through process.execPath and its JavaScript CLI, keep Windows workflow run blocks in PowerShell syntax, or add a documented command-portability-allow comment for an intentional exception.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Command portability contract ok (${sourceFiles.length} source files checked, ${childProcessFiles.length} child-process files, ${packageFiles.length} package manifests and ${workflowFiles.length} workflow files analyzed).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
