import { describe, it, expect } from 'vitest';
import { parseInstructions, auditDockerfile } from '../engines/dockerfile/linter';

describe('Dockerfile Parser & Tokenizer Hardening (Step 1)', () => {
  // TEST 1: Full-line comments must never be interpreted as an active instruction
  it('TEST 1: # RUN apt-get install curl does not create an active instruction', () => {
    const content = `
# RUN apt-get install curl
FROM node:20-alpine
`;
    const instructions = parseInstructions(content);
    expect(instructions.length).toBe(1);
    expect(instructions[0].instruction).toBe('FROM');
    expect(instructions[0].args).toBe('node:20-alpine');
    expect(instructions.some((i) => i.instruction === 'RUN')).toBe(false);
  });

  // TEST 2: # inside quoted command is preserved and not treated as comment
  it('TEST 2: RUN echo "hello # world" preserves the # character inside quoted strings', () => {
    const content = `FROM node:20-alpine\nRUN echo "hello # world"`;
    const instructions = parseInstructions(content);

    expect(instructions.length).toBe(2);
    expect(instructions[1].instruction).toBe('RUN');
    expect(instructions[1].args).toBe('echo "hello # world"');
  });

  // TEST 3: Multiline continuation joined as one instruction
  it('TEST 3: RUN apt-get update \\ && apt-get install -y curl is one single instruction', () => {
    const content = `FROM node:20-alpine
RUN apt-get update \\
  && apt-get install -y curl
`;
    const instructions = parseInstructions(content);
    expect(instructions.length).toBe(2);

    const runInstr = instructions[1];
    expect(runInstr.instruction).toBe('RUN');
    expect(runInstr.args).toBe('apt-get update && apt-get install -y curl');
    expect(runInstr.startLine).toBe(2);
    expect(runInstr.endLine).toBe(3);
  });

  // TEST 4: Trailing whitespace after backslash continuation character
  it('TEST 4: handles trailing spaces and tabs after continuation backslash', () => {
    // Note trailing spaces after backslash on line 2
    const content = 'FROM node:20-alpine\nRUN apt-get update \\   \t\n  && apt-get install -y curl\n';
    const instructions = parseInstructions(content);

    expect(instructions.length).toBe(2);
    const runInstr = instructions[1];
    expect(runInstr.instruction).toBe('RUN');
    expect(runInstr.args).toBe('apt-get update && apt-get install -y curl');
    expect(runInstr.startLine).toBe(2);
    expect(runInstr.endLine).toBe(3);
  });

  // TEST 5: Comments inside multiline RUN continuation
  it('TEST 5: comments inside multiline continuation do not corrupt instruction or split it', () => {
    const content = `FROM node:20-alpine
RUN echo "hello" \\
  # this is a comment explaining the next step
  && echo "world"
`;
    const instructions = parseInstructions(content);
    expect(instructions.length).toBe(2);

    const runInstr = instructions[1];
    expect(runInstr.instruction).toBe('RUN');
    expect(runInstr.args).toBe('echo "hello" && echo "world"');
    expect(runInstr.startLine).toBe(2);
    expect(runInstr.endLine).toBe(4);
    expect(runInstr.raw).toContain('# this is a comment');
  });

  // TEST 6: Valid exec-form JSON with nested single quotes in shell command
  it('TEST 6: CMD ["sh", "-c", "echo \'hello world\'"] is valid JSON and not flagged as single-quote error', () => {
    const content = `FROM node:20-alpine
WORKDIR /app
CMD ["sh", "-c", "echo 'hello world'"]
`;
    const audit = auditDockerfile(content);
    // Should NOT have syntax error SYNTAX-05
    const syntax5Issues = audit.issues.filter((i) => i.ruleCode === 'SYNTAX-05');
    expect(syntax5Issues.length).toBe(0);
    expect(audit.syntaxValid).toBe(true);

    const instructions = parseInstructions(content);
    const cmdInstr = instructions.find((i) => i.instruction === 'CMD');
    expect(cmdInstr).toBeDefined();
    expect(cmdInstr?.args).toBe('["sh", "-c", "echo \'hello world\'"]');
  });

  // TEST 7: COPY --from=alpine preserves flag value
  it('TEST 7: COPY --from=alpine /bin/sh /bin/sh preserves --from value in parser', () => {
    const content = `FROM node:20-alpine\nCOPY --from=alpine /bin/sh /bin/sh`;
    const instructions = parseInstructions(content);

    expect(instructions.length).toBe(2);
    const copyInstr = instructions[1];
    expect(copyInstr.instruction).toBe('COPY');
    expect(copyInstr.args).toBe('--from=alpine /bin/sh /bin/sh');
  });

  // TEST 8: Two separate instructions after continuation boundary remain separate
  it('TEST 8: separate instructions after continuation boundary are not merged', () => {
    const content = `FROM node:20-alpine
RUN apt-get update \\
  && apt-get install -y curl
COPY . /app
WORKDIR /app
`;
    const instructions = parseInstructions(content);
    expect(instructions.length).toBe(4);
    expect(instructions.map((i) => i.instruction)).toEqual(['FROM', 'RUN', 'COPY', 'WORKDIR']);
    expect(instructions[1].startLine).toBe(2);
    expect(instructions[1].endLine).toBe(3);
    expect(instructions[2].startLine).toBe(4);
    expect(instructions[2].endLine).toBe(4);
    expect(instructions[3].startLine).toBe(5);
    expect(instructions[3].endLine).toBe(5);
  });

  // TEST 9: Multiline ENV with quoted values
  it('TEST 9: multiline ENV containing quoted values remains one single instruction', () => {
    const content = `FROM node:20-alpine
ENV NODE_ENV="production" \\
    PORT="8080" \\
    APP_NAME="OpShardener Service"
`;
    const instructions = parseInstructions(content);
    expect(instructions.length).toBe(2);

    const envInstr = instructions[1];
    expect(envInstr.instruction).toBe('ENV');
    expect(envInstr.args).toBe('NODE_ENV="production" PORT="8080" APP_NAME="OpShardener Service"');
    expect(envInstr.startLine).toBe(2);
    expect(envInstr.endLine).toBe(4);
  });

  // TEST 10: Comprehensive complex Dockerfile with comments, blank lines, and continuations
  it('TEST 10: preserves exact instruction sequence and line numbers across mixed content', () => {
    const content = `# Global Parser Header Comment
# Project: OpShardener Suite

FROM golang:1.22-alpine AS builder

# Set build directory
WORKDIR /src

# Copy manifests
COPY go.mod \\
     go.sum \\
     ./

RUN go mod download \\
    # Ensure dependencies verified
    && go mod verify

# Copy remaining source code
COPY . .

RUN CGO_ENABLED=0 go build -o /bin/app .

# Production Runner Stage
FROM alpine:3.19 AS runner

WORKDIR /app

COPY --from=builder /bin/app /app/server

EXPOSE 8080

USER 1001

HEALTHCHECK --interval=30s --timeout=3s \\
  CMD wget -q --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["/app/server"]
`;

    const instructions = parseInstructions(content);

    expect(instructions.length).toBe(13);

    expect(instructions[0]).toMatchObject({ instruction: 'FROM', startLine: 4, endLine: 4 });
    expect(instructions[1]).toMatchObject({ instruction: 'WORKDIR', startLine: 7, endLine: 7 });
    expect(instructions[2]).toMatchObject({ instruction: 'COPY', startLine: 10, endLine: 12 });
    expect(instructions[3]).toMatchObject({ instruction: 'RUN', startLine: 14, endLine: 16 });
    expect(instructions[4]).toMatchObject({ instruction: 'COPY', startLine: 19, endLine: 19 });
    expect(instructions[5]).toMatchObject({ instruction: 'RUN', startLine: 21, endLine: 21 });
    expect(instructions[6]).toMatchObject({ instruction: 'FROM', startLine: 24, endLine: 24 });
    expect(instructions[7]).toMatchObject({ instruction: 'WORKDIR', startLine: 26, endLine: 26 });
    expect(instructions[8]).toMatchObject({ instruction: 'COPY', startLine: 28, endLine: 28 });
    expect(instructions[9]).toMatchObject({ instruction: 'EXPOSE', startLine: 30, endLine: 30 });
    expect(instructions[10]).toMatchObject({ instruction: 'USER', startLine: 32, endLine: 32 });
    expect(instructions[11]).toMatchObject({ instruction: 'HEALTHCHECK', startLine: 34, endLine: 35 });
    expect(instructions[12]).toMatchObject({ instruction: 'ENTRYPOINT', startLine: 37, endLine: 37 });
  });

  it('correctly catches actual single-quote JSON delimiters as SYNTAX-05 error', () => {
    const content = `FROM node:20-alpine\nCMD ['node', 'index.js']`;
    const audit = auditDockerfile(content);
    expect(audit.syntaxValid).toBe(false);
    expect(audit.issues.some((i) => i.ruleCode === 'SYNTAX-05' && i.title.includes('Single Quotes'))).toBe(true);
  });
});
