import { describe, it, expect } from 'vitest';
import { auditDockerfile } from '../engines/dockerfile/linter';

describe('Dockerfile Security Analysis — Privilege, Secrets, and Dangerous Config (Step 4)', () => {
  describe('Secrets in Dockerfile (CK-02)', () => {
    it('detects AWS Access Key ID in ENV or ARG', () => {
      const dockerfile = `FROM node:20-alpine
ENV AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
USER node`;
      const audit = auditDockerfile(dockerfile);
      const secretIssue = audit.issues.find((i) => i.ruleCode === 'CK-02');
      expect(secretIssue).toBeDefined();
      expect(secretIssue?.title).toContain('AWS Access Key ID');
      expect(secretIssue?.severity).toBe('critical');
    });

    it('detects GitHub Personal Access Token in instruction', () => {
      const dockerfile = `FROM node:20-alpine
ARG GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwx
USER node`;
      const audit = auditDockerfile(dockerfile);
      const secretIssue = audit.issues.find((i) => i.ruleCode === 'CK-02');
      expect(secretIssue).toBeDefined();
      expect(secretIssue?.title).toContain('GitHub Personal Access Token');
    });

    it('detects embedded Private Key block', () => {
      const dockerfile = `FROM node:20-alpine
ENV SSH_KEY="-----BEGIN RSA PRIVATE KEY----- MIIEowIBAAKCAQEA0..."
USER node`;
      const audit = auditDockerfile(dockerfile);
      const secretIssue = audit.issues.find((i) => i.ruleCode === 'CK-02');
      expect(secretIssue).toBeDefined();
      expect(secretIssue?.title).toContain('Embedded Private Key');
    });

    it('detects high-entropy hardcoded password in ENV', () => {
      const dockerfile = `FROM node:20-alpine
ENV DB_PASSWORD="P@ssw0rd_Super_Secret_123!"
USER node`;
      const audit = auditDockerfile(dockerfile);
      const secretIssue = audit.issues.find((i) => i.ruleCode === 'CK-02');
      expect(secretIssue).toBeDefined();
      expect(secretIssue?.title).toContain('Hardcoded Password/Secret');
    });

    it('does NOT flag obvious placeholder values like changeme, default, empty strings or environment names', () => {
      const dockerfile = `FROM node:20-alpine
ENV NODE_ENV=production
ENV DB_PASSWORD=changeme
ARG API_KEY=""
ENV SECRET_KEY_BASE="placeholder"
USER node`;
      const audit = auditDockerfile(dockerfile);
      const secretIssues = audit.issues.filter((i) => i.ruleCode === 'CK-02');
      expect(secretIssues.length).toBe(0);
    });

    it('does NOT flag commented-out secret lines', () => {
      const dockerfile = `FROM node:20-alpine
# ENV DB_PASSWORD=P@ssw0rd_Super_Secret_123!
# ARG GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwx
USER node`;
      const audit = auditDockerfile(dockerfile);
      const secretIssues = audit.issues.filter((i) => i.ruleCode === 'CK-02');
      expect(secretIssues.length).toBe(0);
    });
  });

  describe('Dangerous Privileged Configuration (CK-08, CK-13)', () => {
    it('detects passwordless sudoers privilege escalation in RUN (CK-08)', () => {
      const dockerfile = `FROM ubuntu:22.04
RUN echo "appuser ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
USER appuser`;
      const audit = auditDockerfile(dockerfile);
      const sudoersIssue = audit.issues.find((i) => i.ruleCode === 'CK-08' && i.title.includes('Sudoers'));
      expect(sudoersIssue).toBeDefined();
      expect(sudoersIssue?.severity).toBe('critical');
    });

    it('detects --privileged flag in RUN (CK-13)', () => {
      const dockerfile = `FROM docker:dind
RUN dockerd --privileged &
USER root`;
      const audit = auditDockerfile(dockerfile);
      const privIssue = audit.issues.find((i) => i.ruleCode === 'CK-13');
      expect(privIssue).toBeDefined();
      expect(privIssue?.title).toContain('Dangerous Privileged Capability');
      expect(privIssue?.severity).toBe('critical');
    });

    it('detects --cap-add=SYS_ADMIN or --cap-add=ALL in RUN (CK-13)', () => {
      const dockerfile = `FROM alpine:3.19
RUN container-runner --cap-add=SYS_ADMIN start
USER appuser`;
      const audit = auditDockerfile(dockerfile);
      const capIssue = audit.issues.find((i) => i.ruleCode === 'CK-13');
      expect(capIssue).toBeDefined();
      expect(capIssue?.severity).toBe('critical');
    });

    it('does not flag benign capabilities like cap_net_bind_service as CK-13', () => {
      const dockerfile = `FROM alpine:3.19
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node
USER node`;
      const audit = auditDockerfile(dockerfile);
      const capIssue = audit.issues.find((i) => i.ruleCode === 'CK-13');
      expect(capIssue).toBeUndefined();
    });
  });

  describe('Package Installation Hygiene (CK-06, CK-10)', () => {
    it('detects uncleaned Alpine apk cache when --no-cache is missing (CK-06)', () => {
      const dockerfile = `FROM alpine:3.19
RUN apk add curl git
USER appuser`;
      const audit = auditDockerfile(dockerfile);
      const apkIssue = audit.issues.find((i) => i.ruleCode === 'CK-06' && i.title.includes('Alpine'));
      expect(apkIssue).toBeDefined();
      expect(apkIssue?.severity).toBe('optimization');
    });

    it('passes when apk add includes --no-cache flag', () => {
      const dockerfile = `FROM alpine:3.19
RUN apk add --no-cache curl git
USER appuser`;
      const audit = auditDockerfile(dockerfile);
      const apkIssue = audit.issues.find((i) => i.ruleCode === 'CK-06' && i.title.includes('Alpine'));
      expect(apkIssue).toBeUndefined();
    });

    it('detects uncleaned Python pip cache when --no-cache-dir is missing (CK-06)', () => {
      const dockerfile = `FROM python:3.11-slim
RUN pip install flask requests
USER appuser`;
      const audit = auditDockerfile(dockerfile);
      const pipIssue = audit.issues.find((i) => i.ruleCode === 'CK-06' && i.title.includes('Pip'));
      expect(pipIssue).toBeDefined();
    });

    it('passes when pip install includes --no-cache-dir flag', () => {
      const dockerfile = `FROM python:3.11-slim
RUN pip install --no-cache-dir flask requests
USER appuser`;
      const audit = auditDockerfile(dockerfile);
      const pipIssue = audit.issues.find((i) => i.ruleCode === 'CK-06' && i.title.includes('Pip'));
      expect(pipIssue).toBeUndefined();
    });

    it('detects missing -y flag and uncleaned cache in yum / dnf install (CK-10, CK-06)', () => {
      const dockerfile = `FROM almalinux:9
RUN dnf install nginx
USER appuser`;
      const audit = auditDockerfile(dockerfile);
      expect(audit.issues.some((i) => i.ruleCode === 'CK-10' && i.title.includes('yum/dnf'))).toBe(true);
      expect(audit.issues.some((i) => i.ruleCode === 'CK-06' && i.title.includes('Yum/DNF'))).toBe(true);
    });

    it('passes when yum install includes -y and clean all', () => {
      const dockerfile = `FROM almalinux:9
RUN yum install -y nginx && yum clean all
USER appuser`;
      const audit = auditDockerfile(dockerfile);
      expect(audit.issues.some((i) => i.ruleCode === 'CK-10' && i.title.includes('yum/dnf'))).toBe(false);
      expect(audit.issues.some((i) => i.ruleCode === 'CK-06' && i.title.includes('Yum/DNF'))).toBe(false);
    });
  });

  describe('Sensitive Files Copied into Image (CK-14)', () => {
    it('detects COPY of .env files (CK-14)', () => {
      const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY .env ./
USER node`;
      const audit = auditDockerfile(dockerfile);
      const copyIssue = audit.issues.find((i) => i.ruleCode === 'CK-14');
      expect(copyIssue).toBeDefined();
      expect(copyIssue?.title).toContain('.env');
      expect(copyIssue?.severity).toBe('critical');
    });

    it('detects COPY of private keys (.key, .pem, id_rsa)', () => {
      const dockerfile = `FROM nginx:alpine
COPY server.key /etc/ssl/server.key
COPY id_rsa /root/.ssh/id_rsa
USER nginx`;
      const audit = auditDockerfile(dockerfile);
      const keyIssues = audit.issues.filter((i) => i.ruleCode === 'CK-14');
      expect(keyIssues.length).toBe(2);
    });

    it('detects ADD of cloud credential files (credentials.json, gcp-key.json)', () => {
      const dockerfile = `FROM node:20-alpine
ADD service-account.json /app/service-account.json
USER node`;
      const audit = auditDockerfile(dockerfile);
      const addIssue = audit.issues.find((i) => i.ruleCode === 'CK-14');
      expect(addIssue).toBeDefined();
    });

    it('does NOT flag standard source code files like package.json, src/, index.html', () => {
      const dockerfile = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY src/ ./src/
USER node`;
      const audit = auditDockerfile(dockerfile);
      const copyIssues = audit.issues.filter((i) => i.ruleCode === 'CK-14');
      expect(copyIssues.length).toBe(0);
    });
  });
});
