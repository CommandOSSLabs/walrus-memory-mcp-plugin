#!/usr/bin/env node

import { readFileSync } from "node:fs";

const packageName = "@mysten-incubation/memwal-mcp";
const minimumVersion = "0.0.13";
const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

const mcp = JSON.parse(readFileSync(new URL("../.mcp.json", import.meta.url), "utf8"));
const pinArg = mcp.mcpServers?.memwal?.args?.find((arg) => arg.startsWith(`${packageName}@`));
const pinnedVersion = pinArg?.slice(packageName.length + 1);

if (!pinnedVersion || !/^\d+\.\d+\.\d+$/.test(pinnedVersion)) {
    throw new Error(`.mcp.json must pin ${packageName}@<semver> (WALM-627)`);
}

if (compareVersions(pinnedVersion, minimumVersion) < 0) {
    throw new Error(
        `.mcp.json pins ${packageName}@${pinnedVersion}; marketplace rollout requires ${minimumVersion} or newer`,
    );
}

const response = await fetch(registryUrl, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
});

if (!response.ok) {
    throw new Error(`npm registry returned ${response.status} for ${packageName}`);
}

const metadata = await response.json();
const latest = metadata["dist-tags"]?.latest;

if (typeof latest !== "string") {
    throw new Error(`npm registry did not return a latest version for ${packageName}`);
}

if (compareVersions(latest, minimumVersion) < 0) {
    throw new Error(
        `${packageName}@latest is ${latest}; marketplace rollout requires ${minimumVersion} or newer`,
    );
}

if (!metadata.versions?.[pinnedVersion]) {
    throw new Error(`${packageName}@${pinnedVersion} is not published; npx would fail for plugin users`);
}

if (compareVersions(pinnedVersion, latest) < 0) {
    console.warn(
        `${packageName} pin ${pinnedVersion} is behind latest ${latest}; bump .mcp.json when ready`,
    );
}

console.log(
    `${packageName} pin ${pinnedVersion}; npm latest ${latest} satisfies >=${minimumVersion}`,
);

function compareVersions(left, right) {
    const a = parseStableVersion(left);
    const b = parseStableVersion(right);

    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return a[index] - b[index];
    }

    return 0;
}

function parseStableVersion(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match) throw new Error(`Expected a stable semantic version, received ${version}`);
    return match.slice(1).map(Number);
}
