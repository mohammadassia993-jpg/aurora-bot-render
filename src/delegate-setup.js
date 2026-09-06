import fs from 'node:fs';
import path from 'node:path';
import { generateKeypair, principalId } from 'delegate-os';
import { createDCT, inspectDCT } from 'delegate-os';
import { info, warn } from './logger.js';
import { config } from './config.js';

const AGENTS_DIR = path.join(config.root, 'data', 'agents');
const ROOT_KEYPAIR_FILE = path.join(AGENTS_DIR, 'root.keypair.json');
const DCT_DIR = path.join(AGENTS_DIR, 'dcts');

const AGENT_DEFS = {
  commander: {
    label: 'القائد',
    capabilities: [
      { namespace: '*', action: '*', resource: '**' }
    ],
    maxBudgetMicrocents: 1_000_000_000,
    maxChainDepth: 3,
    expiresHours: 8760
  },
  planner: {
    label: 'المخطط',
    capabilities: [
      { namespace: 'plan', action: '*', resource: '**' },
      { namespace: 'analyze', action: '*', resource: '**' },
      { namespace: 'task', action: 'read', resource: '**' },
      { namespace: 'report', action: 'create', resource: '**' }
    ],
    maxBudgetMicrocents: 100_000_000,
    maxChainDepth: 1,
    expiresHours: 8760
  },
  executor: {
    label: 'المنفذ',
    capabilities: [
      { namespace: 'code', action: '*', resource: '**' },
      { namespace: 'deploy', action: '*', resource: '**' },
      { namespace: 'task', action: '*', resource: '**' },
      { namespace: 'email', action: 'send', resource: '**' },
      { namespace: 'platform', action: 'create_account', resource: '**' }
    ],
    maxBudgetMicrocents: 200_000_000,
    maxChainDepth: 1,
    expiresHours: 8760
  },
  reviewer: {
    label: 'المراجع',
    capabilities: [
      { namespace: 'review', action: '*', resource: '**' },
      { namespace: 'validate', action: '*', resource: '**' },
      { namespace: 'audit', action: '*', resource: '**' },
      { namespace: 'task', action: 'read', resource: '**' }
    ],
    maxBudgetMicrocents: 50_000_000,
    maxChainDepth: 0,
    expiresHours: 8760
  },
  scout: {
    label: 'المستخبر',
    capabilities: [
      { namespace: 'web', action: 'search', resource: '**' },
      { namespace: 'research', action: '*', resource: '**' },
      { namespace: 'discover', action: '*', resource: '**' },
      { namespace: 'monitor', action: '*', resource: '**' }
    ],
    maxBudgetMicrocents: 100_000_000,
    maxChainDepth: 1,
    expiresHours: 8760
  }
};

function ensureDirs() {
  fs.mkdirSync(AGENTS_DIR, { recursive: true });
  fs.mkdirSync(DCT_DIR, { recursive: true });
}

function loadOrCreateRootKeypair() {
  if (fs.existsSync(ROOT_KEYPAIR_FILE)) {
    const raw = JSON.parse(fs.readFileSync(ROOT_KEYPAIR_FILE, 'utf8'));
    const privateKey = Uint8Array.from(Buffer.from(raw.privateKeyBase64, 'base64'));
    const pubKeyBytes = Uint8Array.from(Buffer.from(raw.publicKeyBase64, 'base64'));
    return {
      principal: {
        id: raw.principalId || principalId(pubKeyBytes),
        name: 'commander'
      },
      privateKey
    };
  }
  const kp = generateKeypair('commander');
  const data = {
    principalId: kp.principal.id,
    name: kp.principal.name,
    privateKeyBase64: Buffer.from(kp.privateKey).toString('base64'),
    publicKeyBase64: Buffer.from(kp.principal.id, 'utf8').toString('base64')
  };
  fs.writeFileSync(ROOT_KEYPAIR_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  info('delegate', `root keypair created: ${kp.principal.id}`);
  return kp;
}

function loadOrCreateAgentKeypair(agentName) {
  const file = path.join(AGENTS_DIR, `${agentName}.keypair.json`);
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const privateKey = Uint8Array.from(Buffer.from(raw.privateKeyBase64, 'base64'));
    const pubKeyBytes = Uint8Array.from(Buffer.from(raw.publicKeyBase64, 'base64'));
    return {
      principal: {
        id: raw.principalId || principalId(pubKeyBytes),
        name: agentName
      },
      privateKey
    };
  }
  const kp = generateKeypair(agentName);
  const data = {
    principalId: kp.principal.id,
    name: kp.principal.name,
    privateKeyBase64: Buffer.from(kp.privateKey).toString('base64'),
    publicKeyBase64: Buffer.from(kp.principal.id, 'utf8').toString('base64')
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  info('delegate', `keypair created for ${agentName}: ${kp.principal.id}`);
  return kp;
}

export function setupDelegation() {
  ensureDirs();
  const rootKp = loadOrCreateRootKeypair();
  const dcts = {};

  for (const [agentName, def] of Object.entries(AGENT_DEFS)) {
    const agentKp = loadOrCreateAgentKeypair(agentName);
    const dctFile = path.join(DCT_DIR, `${agentName}.dct.json`);

    if (fs.existsSync(dctFile)) {
      const serialized = JSON.parse(fs.readFileSync(dctFile, 'utf8'));
      dcts[agentName] = serialized;
      info('delegate', `DCT loaded for ${agentName}`);
      continue;
    }

    const now = new Date();
    const expires = new Date(now.getTime() + def.expiresHours * 3600_000);

    const serialized = createDCT({
      issuer: rootKp,
      delegatee: agentKp.principal,
      capabilities: def.capabilities,
      contractId: `delegation-${agentName}-root`,
      delegationId: `del-${agentName}-${Date.now()}`,
      parentDelegationId: '',
      chainDepth: 0,
      maxChainDepth: def.maxChainDepth,
      maxBudgetMicrocents: def.maxBudgetMicrocents,
      expiresAt: expires.toISOString()
    });

    fs.writeFileSync(dctFile, JSON.stringify(serialized, null, 2), { mode: 0o600 });
    dcts[agentName] = serialized;
    const meta = inspectDCT(serialized);
    info('delegate', `DCT created for ${agentName}: cap=${meta.capabilities.length} depth=${meta.maxChainDepth}`);
  }

  const manifest = {
    rootPrincipalId: rootKp.principal.id,
    agents: {},
    createdAt: new Date().toISOString()
  };
  for (const [agentName, def] of Object.entries(AGENT_DEFS)) {
    const kp = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, `${agentName}.keypair.json`), 'utf8'));
    manifest.agents[agentName] = {
      principalId: kp.principalId,
      label: def.label,
      capabilities: def.capabilities.map(c => `${c.namespace}:${c.action}:${c.resource}`),
      maxBudgetMicrocents: def.maxBudgetMicrocents,
      maxChainDepth: def.maxChainDepth
    };
  }
  fs.writeFileSync(path.join(AGENTS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });

  info('delegate', 'delegation setup complete', { agents: Object.keys(dcts).length });
  return { rootPrincipalId: rootKp.principal.id, agentCount: Object.keys(dcts).length };
}

export function getAgentKeypair(agentName) {
  const file = path.join(AGENTS_DIR, `${agentName}.keypair.json`);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const privateKey = Uint8Array.from(Buffer.from(raw.privateKeyBase64, 'base64'));
  return {
    principal: { id: raw.principalId, name: agentName },
    privateKey
  };
}

export function getRootKeypair() {
  const raw = JSON.parse(fs.readFileSync(ROOT_KEYPAIR_FILE, 'utf8'));
  const privateKey = Uint8Array.from(Buffer.from(raw.privateKeyBase64, 'base64'));
  return {
    principal: { id: raw.principalId, name: 'commander' },
    privateKey
  };
}

export function getAgentDCT(agentName) {
  const file = path.join(DCT_DIR, `${agentName}.dct.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function getManifest() {
  const file = path.join(AGENTS_DIR, 'manifest.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export { AGENT_DEFS };
