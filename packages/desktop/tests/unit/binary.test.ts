import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPinned, pinnedExecutable } from '../../src/binary.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the pinned agent-desktop', () => {
  it('lives in the OS cache, never in the replay cache E2E_CACHE_DIR names', () => {
    const env = { HOME: '/home/ada', USERPROFILE: '/home/ada', XDG_CACHE_HOME: '/home/ada/.cache', LOCALAPPDATA: '/home/ada/local' };
    expect(pinnedExecutable({ ...env, E2E_CACHE_DIR: '.e2e/cache' })).toBe(pinnedExecutable(env));
    expect(pinnedExecutable(env)).toMatch(/^\/home\/ada\/.*[\\/]e2e[\\/]/);
  });

  it('refuses an archive whose SHA-256 is not the pinned one, and caches nothing', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))));
    const env = { HOME: '/nonexistent', USERPROFILE: '/nonexistent', XDG_CACHE_HOME: '/nonexistent/cache', LOCALAPPDATA: '/nonexistent/local' };
    await expect(installPinned(env, new AbortController().signal, () => undefined)).rejects.toMatchObject({ code: 'AGENT_DESKTOP_INSTALL_FAILED', message: expect.stringMatching(/refusing to unpack/) });
    expect(existsSync(pinnedExecutable(env)!)).toBe(false);
  });

  it('downloads again over a cache entry no verified unpack stamped', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'e2e-desktop-cache-'));
    try {
      const env = { HOME: home, USERPROFILE: home, XDG_CACHE_HOME: path.join(home, 'cache'), LOCALAPPDATA: path.join(home, 'local') };
      const executable = pinnedExecutable(env)!;
      mkdirSync(path.dirname(executable), { recursive: true });
      writeFileSync(executable, '#!/bin/sh\n');
      chmodSync(executable, 0o755);
      let fetched = 0;
      vi.stubGlobal('fetch', () => {
        fetched += 1;
        return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
      });
      await expect(installPinned(env, new AbortController().signal, () => undefined)).rejects.toMatchObject({ code: 'AGENT_DESKTOP_INSTALL_FAILED' });
      expect(fetched).toBe(1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('reports a failed download as AGENT_DESKTOP_INSTALL_FAILED', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')));
    const env = { HOME: '/nonexistent', USERPROFILE: '/nonexistent', XDG_CACHE_HOME: '/nonexistent/cache', LOCALAPPDATA: '/nonexistent/local' };
    await expect(installPinned(env, new AbortController().signal, () => undefined)).rejects.toMatchObject({ code: 'AGENT_DESKTOP_INSTALL_FAILED' });
  });
});
